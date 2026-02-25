import { promises as fs } from "fs";
import { homedir } from "os";
import { join } from "path";
import { createHash, X509Certificate } from "crypto";
import { Parser } from "xml2js";
import type { ExecResult } from "../../models";
import { logger } from "../logger";
import { Xcodebuild, XcodebuildClient } from "./XcodebuildClient";

export type SigningStyle = "automatic" | "manual";

export interface SigningIdentity {
  name: string;
  fingerprint: string;
  validTo?: Date;
  subject?: string;
  issuer?: string;
}

export interface CertificateInfo {
  fingerprint: string;
  validTo?: Date;
  subject?: string;
  issuer?: string;
}

export interface ProvisioningProfile {
  uuid: string;
  name: string;
  teamIds: string[];
  teamName?: string;
  expirationDate: Date;
  creationDate?: Date;
  provisionsAllDevices: boolean;
  provisionedDevices: string[] | null;
  entitlements: Record<string, unknown>;
  developerCertificates: CertificateInfo[];
  profileType: "development" | "distribution" | "ad-hoc" | "enterprise" | "unknown";
  path: string;
}

export interface SigningResolution {
  style: SigningStyle;
  teamId?: string;
  identity?: SigningIdentity;
  profile?: ProvisioningProfile;
  entitlementsPath?: string;
  buildSettings: string[];
  allowProvisioningUpdates: boolean;
  warnings: string[];
}

export interface XcodeSigningDependencies {
  platform: () => NodeJS.Platform;
  exec: (command: string) => Promise<ExecResult>;
  xcodebuild: Xcodebuild;
  readDir: (path: string) => Promise<string[]>;
  readFile: (path: string) => Promise<string>;
  stat: (path: string) => Promise<{ isFile: () => boolean }>;
  writeFile: (path: string, data: string) => Promise<void>;
  mkdir: (path: string) => Promise<void>;
  homedir: () => string;
  now: () => number;
}

const plistParser = new Parser({
  explicitChildren: true,
  preserveChildrenOrder: true,
  explicitRoot: false
});

type PlistNode = {
  "#name": string;
  "_": string;
  "$$"?: PlistNode[];
};

const createDefaultDependencies = (): XcodeSigningDependencies => ({
  platform: () => process.platform,
  exec: async command => {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const result = await promisify(exec)(command);
    const stdout = typeof result.stdout === "string" ? result.stdout : result.stdout.toString();
    const stderr = typeof result.stderr === "string" ? result.stderr : result.stderr.toString();
    return {
      stdout,
      stderr,
      toString() { return stdout; },
      trim() { return stdout.trim(); },
      includes(searchString: string) { return stdout.includes(searchString); }
    };
  },
  xcodebuild: new XcodebuildClient(),
  readDir: async path => fs.readdir(path),
  readFile: async path => fs.readFile(path, "utf-8"),
  stat: async path => fs.stat(path),
  writeFile: async (path, data) => fs.writeFile(path, data, "utf-8"),
  mkdir: async path => fs.mkdir(path, { recursive: true }),
  homedir,
  now: () => Date.now()
});

const quoteShell = (value: string): string => `'${value.replace(/'/g, "'\\''")}'`;

const parsePlistValue = (node: PlistNode | undefined): unknown => {
  if (!node) {
    return null;
  }

  switch (node["#name"]) {
    case "dict": {
      const result: Record<string, unknown> = {};
      const children = node.$$ ?? [];
      for (let i = 0; i < children.length; i += 2) {
        const keyNode = children[i];
        const valueNode = children[i + 1];
        if (!keyNode || keyNode["#name"] !== "key") {
          continue;
        }
        result[keyNode._] = parsePlistValue(valueNode);
      }
      return result;
    }
    case "array":
      return (node.$$ ?? []).map(child => parsePlistValue(child));
    case "string":
    case "data":
      return node._ ?? "";
    case "date":
      return node._ ? new Date(node._) : null;
    case "integer":
    case "real":
      return node._ ? Number(node._) : null;
    case "true":
      return true;
    case "false":
      return false;
    default:
      return node._ ?? null;
  }
};

const parsePlist = async (xml: string): Promise<unknown> => {
  const parsed = await plistParser.parseStringPromise(xml) as PlistNode;
  const root = parsed["#name"] === "plist" ? parsed.$$?.[0] : parsed;
  return parsePlistValue(root);
};

const parseSigningIdentities = (output: string): SigningIdentity[] => {
  const identities: SigningIdentity[] = [];
  const lines = output.split("\n");
  for (const line of lines) {
    const match = line.match(/^\s*\d+\)\s+([0-9A-F]{40,64})\s+\"([^\"]+)\"/i);
    if (!match) {
      continue;
    }
    identities.push({
      fingerprint: match[1].toUpperCase(),
      name: match[2]
    });
  }
  return identities;
};

const fingerprintFromCertificate = (base64Der: string): CertificateInfo | null => {
  try {
    const raw = Buffer.from(base64Der, "base64");
    const cert = new X509Certificate(raw);
    const fingerprint = createHash("sha256").update(cert.raw).digest("hex").toUpperCase();
    return {
      fingerprint,
      validTo: new Date(cert.validTo),
      subject: cert.subject,
      issuer: cert.issuer
    };
  } catch (error) {
    logger.warn(`[XcodeSigning] Failed to parse certificate: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
};

const resolveProfileType = (entitlements: Record<string, unknown>, provisionsAllDevices: boolean, provisionedDevices: string[] | null): ProvisioningProfile["profileType"] => {
  if (provisionsAllDevices) {
    return "enterprise";
  }
  if (provisionedDevices && provisionedDevices.length > 0) {
    return entitlements["get-task-allow"] === true ? "development" : "ad-hoc";
  }
  return "distribution";
};

const isCertificateExpired = (certificate: CertificateInfo, now: number): boolean => {
  if (!certificate.validTo) {
    return false;
  }
  return certificate.validTo.getTime() <= now;
};

const isAppleIssuer = (certificate: CertificateInfo): boolean => {
  return Boolean(certificate.issuer?.toLowerCase().includes("apple"));
};

const formatBuildSettingValue = (value: string): string => {
  if (value.includes("\"") || value.includes("\\")) {
    const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
    return `"${escaped}"`;
  }
  if (value.includes(" ") || value.includes("\t")) {
    return `"${value}"`;
  }
  return value;
};

const buildSetting = (key: string, value: string): string => `${key}=${formatBuildSettingValue(value)}`;

const buildSettingsForManual = (
  teamId: string | undefined,
  identity: SigningIdentity | undefined,
  profile: ProvisioningProfile,
  entitlementsPath?: string
): string[] => {
  const settings: string[] = ["CODE_SIGN_STYLE=Manual"];
  if (teamId) {
    settings.push(buildSetting("DEVELOPMENT_TEAM", teamId));
  }
  if (identity) {
    settings.push(buildSetting("CODE_SIGN_IDENTITY", identity.name));
  }
  settings.push(buildSetting("PROVISIONING_PROFILE_SPECIFIER", profile.name));
  if (entitlementsPath) {
    settings.push(buildSetting("CODE_SIGN_ENTITLEMENTS", entitlementsPath));
  }
  return settings;
};

const buildSettingsForAutomatic = (teamId: string | undefined): string[] => {
  const settings: string[] = ["CODE_SIGN_STYLE=Automatic"];
  if (teamId) {
    settings.push(buildSetting("DEVELOPMENT_TEAM", teamId));
  }
  return settings;
};

const serializePlist = (value: unknown, indent: string = ""): string => {
  const nextIndent = `${indent}  `;
  if (value === null || value === undefined) {
    return `${indent}<string></string>`;
  }
  if (typeof value === "string") {
    return `${indent}<string>${value}</string>`;
  }
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? `${indent}<integer>${value}</integer>`
      : `${indent}<real>${value}</real>`;
  }
  if (typeof value === "boolean") {
    return `${indent}<${value ? "true" : "false"}/>`;
  }
  if (value instanceof Date) {
    return `${indent}<date>${value.toISOString()}</date>`;
  }
  if (Array.isArray(value)) {
    const items = value.map(item => serializePlist(item, nextIndent)).join("\n");
    return `${indent}<array>\n${items}\n${indent}</array>`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const lines = entries.map(([key, val]) => {
      const keyLine = `${nextIndent}<key>${key}</key>`;
      const valueLine = serializePlist(val, nextIndent);
      return `${keyLine}\n${valueLine}`;
    });
    return `${indent}<dict>\n${lines.join("\n")}\n${indent}</dict>`;
  }
  return `${indent}<string>${String(value)}</string>`;
};

const entitlementsPlist = (entitlements: Record<string, unknown>): string => {
  const body = serializePlist(entitlements, "  ");
  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">",
    "<plist version=\"1.0\">",
    body,
    "</plist>"
  ].join("\n");
};

export class XcodeSigningManager {
  private readonly dependencies: XcodeSigningDependencies;

  constructor(dependencies: XcodeSigningDependencies = createDefaultDependencies()) {
    this.dependencies = dependencies;
  }

  public async listProvisioningProfiles(): Promise<ProvisioningProfile[]> {
    if (this.dependencies.platform() !== "darwin") {
      return [];
    }

    let entries: string[];
    try {
      entries = await this.dependencies.readDir(this.profileDirectory());
    } catch {
      return [];
    }

    const profiles: ProvisioningProfile[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(".mobileprovision")) {
        continue;
      }
      const path = join(this.profileDirectory(), entry);
      const profile = await this.parseProvisioningProfile(path);
      if (profile) {
        profiles.push(profile);
      }
    }
    return profiles;
  }

  public async listSigningIdentities(): Promise<SigningIdentity[]> {
    if (this.dependencies.platform() !== "darwin") {
      return [];
    }
    const result = await this.dependencies.exec("security find-identity -v -p codesigning");
    return parseSigningIdentities(result.stdout);
  }

  public async detectTeamIdsFromXcode(): Promise<string[]> {
    const projectPath = join(process.cwd(), "ios", "CtrlProxy iOS", "CtrlProxy iOS.xcodeproj");
    try {
      if (this.dependencies.platform() !== "darwin") {
        const available = await this.dependencies.xcodebuild.isAvailable();
        if (!available) {
          return [];
        }
      }

      const result = await this.dependencies.xcodebuild.executeCommand(
        ["-showBuildSettings", "-project", projectPath, "-scheme", "CtrlProxyApp"],
        { timeoutMs: 30000, maxBuffer: 10 * 1024 * 1024 }
      );
      const teams = new Set<string>();
      for (const line of result.stdout.split("\n")) {
        const match = line.match(/DEVELOPMENT_TEAM\s*=\s*([A-Z0-9]+)/);
        if (match) {
          teams.add(match[1]);
        }
      }
      return [...teams];
    } catch (error) {
      logger.warn(`[XcodeSigning] Failed to detect team IDs: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  public async resolveSigningForDevice(deviceUdid: string): Promise<SigningResolution> {
    const warnings: string[] = [];
    const preferredTeamIds = this.readTeamIdPreferences();
    const preferredProfile = this.readProfilePreference();
    const preferredIdentity = this.readIdentityPreference();

    const [profiles, identities, detectedTeams] = await Promise.all([
      this.listProvisioningProfiles(),
      this.listSigningIdentities(),
      this.detectTeamIdsFromXcode()
    ]);

    const teamIds = preferredTeamIds.length > 0 ? preferredTeamIds : detectedTeams;

    let selectedProfile: ProvisioningProfile | undefined;
    if (preferredProfile) {
      selectedProfile = profiles.find(profile =>
        profile.uuid === preferredProfile || profile.name === preferredProfile
      );
      if (!selectedProfile) {
        warnings.push(`Requested provisioning profile '${preferredProfile}' not found`);
      }
    }

    const now = this.dependencies.now();
    if (selectedProfile && selectedProfile.expirationDate.getTime() <= now) {
      warnings.push(`Provisioning profile '${selectedProfile.name}' is expired`);
    }
    if (selectedProfile && !selectedProfile.provisionsAllDevices) {
      const matchesDevice = selectedProfile.provisionedDevices?.includes(deviceUdid) ?? false;
      if (!matchesDevice) {
        warnings.push(`Provisioning profile '${selectedProfile.name}' does not include device ${deviceUdid}`);
      }
    }
    const eligibleProfiles = profiles.filter(profile => {
      if (profile.expirationDate.getTime() <= now) {
        return false;
      }
      if (teamIds.length > 0 && !profile.teamIds.some(teamId => teamIds.includes(teamId))) {
        return false;
      }
      if (profile.provisionsAllDevices) {
        return true;
      }
      return profile.provisionedDevices?.includes(deviceUdid) ?? false;
    });

    if (!selectedProfile) {
      const profileOrder: ProvisioningProfile["profileType"][] = ["development", "ad-hoc", "enterprise", "distribution", "unknown"];
      const sorted = eligibleProfiles.sort((a, b) => profileOrder.indexOf(a.profileType) - profileOrder.indexOf(b.profileType));
      selectedProfile = sorted[0];
    }

    let selectedIdentity: SigningIdentity | undefined;
    if (preferredIdentity) {
      selectedIdentity = identities.find(identity =>
        identity.fingerprint === preferredIdentity.toUpperCase() ||
        identity.name.includes(preferredIdentity)
      );
      if (!selectedIdentity) {
        warnings.push(`Requested signing identity '${preferredIdentity}' not found`);
      }
    }

    if (!selectedIdentity && selectedProfile) {
      const fingerprints = new Set(selectedProfile.developerCertificates.map(cert => cert.fingerprint));
      selectedIdentity = identities.find(identity => fingerprints.has(identity.fingerprint));
    }

    const resolvedTeamId = teamIds[0] ?? selectedProfile?.teamIds[0];

    if (selectedProfile && selectedIdentity) {
      const matchingCert = selectedProfile.developerCertificates.find(cert => cert.fingerprint === selectedIdentity?.fingerprint);
      if (matchingCert && isCertificateExpired(matchingCert, now)) {
        warnings.push(`Signing certificate for '${selectedProfile.name}' is expired`);
      }
      if (matchingCert && !isAppleIssuer(matchingCert)) {
        warnings.push(`Signing certificate issuer for '${selectedProfile.name}' is not an Apple CA`);
      }
      const allowTask = selectedProfile.entitlements["get-task-allow"] === true;
      if (selectedProfile.profileType === "development" && !allowTask) {
        warnings.push(`Development profile '${selectedProfile.name}' missing get-task-allow entitlement`);
      }
      if (selectedProfile.profileType === "distribution" && allowTask) {
        warnings.push(`Distribution profile '${selectedProfile.name}' enables get-task-allow`);
      }
      const entitlementsPath = await this.writeEntitlementsIfNeeded(selectedProfile);
      return {
        style: "manual",
        teamId: resolvedTeamId,
        identity: selectedIdentity,
        profile: selectedProfile,
        entitlementsPath,
        buildSettings: buildSettingsForManual(resolvedTeamId, selectedIdentity, selectedProfile, entitlementsPath),
        allowProvisioningUpdates: false,
        warnings
      };
    }

    if (selectedProfile && !selectedIdentity) {
      warnings.push(`No matching signing identity for profile '${selectedProfile.name}'`);
    }

    if (!selectedProfile) {
      warnings.push("No matching provisioning profile found for device");
    }
    const buildSettings = buildSettingsForAutomatic(resolvedTeamId);
    return {
      style: "automatic",
      teamId: resolvedTeamId,
      buildSettings,
      allowProvisioningUpdates: true,
      warnings
    };
  }

  private readTeamIdPreferences(): string[] {
    const raw = process.env.AUTOMOBILE_IOS_TEAM_IDS ?? process.env.AUTOMOBILE_IOS_TEAM_ID ?? "";
    if (!raw) {
      return [];
    }
    return raw.split(",").map(value => value.trim()).filter(Boolean);
  }

  private readProfilePreference(): string | null {
    const value = process.env.AUTOMOBILE_IOS_PROFILE_UUID
      ?? process.env.AUTOMOBILE_IOS_PROFILE_NAME
      ?? process.env.AUTOMOBILE_IOS_PROFILE_SPECIFIER;
    return value?.trim() || null;
  }

  private readIdentityPreference(): string | null {
    const value = process.env.AUTOMOBILE_IOS_CODE_SIGN_IDENTITY ?? "";
    return value.trim().length > 0 ? value.trim() : null;
  }

  private async parseProvisioningProfile(path: string): Promise<ProvisioningProfile | null> {
    try {
      const cmsCommand = `security cms -D -i ${quoteShell(path)}`;
      const decoded = await this.dependencies.exec(cmsCommand);
      const plist = await parsePlist(decoded.stdout);
      if (!plist || typeof plist !== "object") {
        return null;
      }
      const data = plist as Record<string, unknown>;
      const uuid = String(data.UUID ?? "");
      const name = String(data.Name ?? "");
      const teamIds = Array.isArray(data.TeamIdentifier) ? data.TeamIdentifier.map(String) : [];
      const teamName = typeof data.TeamName === "string" ? data.TeamName : undefined;
      const expirationDate = data.ExpirationDate instanceof Date ? data.ExpirationDate : new Date(String(data.ExpirationDate ?? ""));
      const creationDate = data.CreationDate instanceof Date ? data.CreationDate : data.CreationDate ? new Date(String(data.CreationDate)) : undefined;
      const provisionsAllDevices = data.ProvisionsAllDevices === true;
      const provisionedDevices = Array.isArray(data.ProvisionedDevices)
        ? data.ProvisionedDevices.map(String)
        : null;
      const entitlements = typeof data.Entitlements === "object" && data.Entitlements
        ? data.Entitlements as Record<string, unknown>
        : {};
      const developerCertificates = Array.isArray(data.DeveloperCertificates)
        ? data.DeveloperCertificates.map(String)
        : [];
      const certificates = developerCertificates
        .map(cert => fingerprintFromCertificate(cert))
        .filter(Boolean)
        .map(cert => cert as CertificateInfo);

      if (!uuid || !name || !expirationDate || Number.isNaN(expirationDate.getTime())) {
        return null;
      }

      const profileType = resolveProfileType(entitlements, provisionsAllDevices, provisionedDevices);

      return {
        uuid,
        name,
        teamIds,
        teamName,
        expirationDate,
        creationDate,
        provisionsAllDevices,
        provisionedDevices,
        entitlements,
        developerCertificates: certificates,
        profileType,
        path
      };
    } catch (error) {
      logger.warn(`[XcodeSigning] Failed to parse profile '${path}': ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  private async writeEntitlementsIfNeeded(profile: ProvisioningProfile): Promise<string | undefined> {
    const hasEntitlements = Object.keys(profile.entitlements ?? {}).length > 0;
    if (!hasEntitlements) {
      return undefined;
    }
    if (process.env.AUTOMOBILE_IOS_CODE_SIGN_ENTITLEMENTS_PATH) {
      return process.env.AUTOMOBILE_IOS_CODE_SIGN_ENTITLEMENTS_PATH;
    }
    const filename = `${profile.uuid}.plist`;
    const entitlementsDir = this.entitlementsDirectory();
    await this.dependencies.mkdir(entitlementsDir);
    const target = join(entitlementsDir, filename);
    await this.dependencies.writeFile(target, entitlementsPlist(profile.entitlements));
    return target;
  }

  private profileDirectory(): string {
    return join(this.dependencies.homedir(), "Library", "MobileDevice", "Provisioning Profiles");
  }

  private entitlementsDirectory(): string {
    return join(this.dependencies.homedir(), ".automobile", "xctestservice", "entitlements");
  }
}
