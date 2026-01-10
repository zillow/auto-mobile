import { join } from "path";
import { FileSystem, DefaultFileSystem } from "../filesystem/DefaultFileSystem";
import { SystemDetection, DefaultSystemDetection } from "../system/SystemDetection";
import {
  getAndroidSdkFromEnvironment,
  getTypicalAndroidSdkPaths,
  isToolInPath,
  getToolPathFromPath
} from "./detection";

export type AaptToolName = "aapt2" | "aapt";

export interface AaptToolLocation {
  tool: AaptToolName;
  path: string;
}

export interface AndroidBuildToolsLocator {
  findAaptTool(): Promise<AaptToolLocation | null>;
}

export class DefaultAndroidBuildToolsLocator implements AndroidBuildToolsLocator {
  private fileSystem: FileSystem;
  private systemDetection: SystemDetection;

  constructor(
    fileSystem: FileSystem = new DefaultFileSystem(),
    systemDetection: SystemDetection = new DefaultSystemDetection()
  ) {
    this.fileSystem = fileSystem;
    this.systemDetection = systemDetection;
  }

  async findAaptTool(): Promise<AaptToolLocation | null> {
    const aapt2FromPath = await this.findToolInPath("aapt2");
    if (aapt2FromPath) {
      return aapt2FromPath;
    }

    const aapt2FromSdk = await this.findToolInBuildTools("aapt2");
    if (aapt2FromSdk) {
      return aapt2FromSdk;
    }

    const aaptFromPath = await this.findToolInPath("aapt");
    if (aaptFromPath) {
      return aaptFromPath;
    }

    return this.findToolInBuildTools("aapt");
  }

  private async findToolInPath(tool: AaptToolName): Promise<AaptToolLocation | null> {
    if (!(await isToolInPath(tool, this.systemDetection))) {
      return null;
    }

    const toolPath = await getToolPathFromPath(tool, this.systemDetection);
    if (!toolPath) {
      return null;
    }

    return { tool, path: toolPath };
  }

  private async findToolInBuildTools(tool: AaptToolName): Promise<AaptToolLocation | null> {
    const sdkRoots = this.getSdkRoots();
    for (const sdkRoot of sdkRoots) {
      const buildToolsDir = join(sdkRoot, "build-tools");
      if (!this.fileSystem.existsSync(buildToolsDir)) {
        continue;
      }

      let versions: string[] = [];
      try {
        versions = await this.fileSystem.readdir(buildToolsDir);
      } catch {
        continue;
      }

      const sortedVersions = this.sortVersionsDescending(versions);
      for (const version of sortedVersions) {
        const toolPath = join(buildToolsDir, version, this.getToolFileName(tool));
        if (this.fileSystem.existsSync(toolPath)) {
          return { tool, path: toolPath };
        }
      }
    }

    return null;
  }

  private getSdkRoots(): string[] {
    const roots: string[] = [];
    const envSdk = getAndroidSdkFromEnvironment(this.systemDetection);
    if (envSdk) {
      roots.push(envSdk);
    }

    for (const candidate of getTypicalAndroidSdkPaths(this.systemDetection)) {
      if (!roots.includes(candidate)) {
        roots.push(candidate);
      }
    }

    return roots;
  }

  private getToolFileName(tool: AaptToolName): string {
    return this.systemDetection.getCurrentPlatform() === "win32" ? `${tool}.exe` : tool;
  }

  private sortVersionsDescending(versions: string[]): string[] {
    return [...versions].sort((left, right) => {
      const leftParts = this.parseVersion(left);
      const rightParts = this.parseVersion(right);
      const maxLength = Math.max(leftParts.length, rightParts.length);

      for (let index = 0; index < maxLength; index += 1) {
        const leftValue = leftParts[index] ?? 0;
        const rightValue = rightParts[index] ?? 0;

        if (leftValue !== rightValue) {
          return rightValue - leftValue;
        }
      }

      return right.localeCompare(left);
    });
  }

  private parseVersion(version: string): number[] {
    return version
      .split(".")
      .map(part => Number.parseInt(part.replace(/\D/g, ""), 10))
      .map(value => (Number.isNaN(value) ? 0 : value));
  }
}
