import { AdbClientFactory, defaultAdbClientFactory } from "../../utils/android-cmdline-tools/AdbClientFactory";
import type { AdbExecutor } from "../../utils/android-cmdline-tools/interfaces/AdbExecutor";
import type { ProcessExecutor } from "../../utils/ProcessExecutor";
import { DefaultProcessExecutor } from "../../utils/ProcessExecutor";
import { logger } from "../../utils/logger";
import {
  BootedDevice,
  GetCalendarSystemResult,
  LocalizationSettingsResult,
  Set24HourFormatResult,
  SetLocaleResult,
  SetTextDirectionResult,
  SetTimeZoneResult
} from "../../models";

type TextDirectionSettingKey = "debug.force_rtl" | "force_rtl";

type CommandAttempt = {
  method: string;
  command: string;
};

const IOS_PHYSICAL_DEVICE_ERROR = "Localization changes are only supported on iOS Simulator.";
const DEFAULT_CALENDAR_SYSTEM = "gregory";

export class SystemConfigurationManager {
  private device: BootedDevice;
  private adb: AdbExecutor;
  private processExecutor: ProcessExecutor;

  constructor(
    device: BootedDevice,
    adbFactory: AdbClientFactory = defaultAdbClientFactory,
    processExecutor: ProcessExecutor = new DefaultProcessExecutor()
  ) {
    this.device = device;
    this.adb = adbFactory.create(device);
    this.processExecutor = processExecutor;
  }

  async setLocale(languageTag: string, options: { broadcast?: boolean } = {}): Promise<SetLocaleResult> {
    const trimmedTag = languageTag.trim();
    if (!trimmedTag) {
      return {
        success: false,
        languageTag,
        error: "languageTag must be a non-empty string"
      };
    }

    if (this.device.platform === "ios") {
      return this.setLocaleIos(trimmedTag);
    }

    if (this.device.platform !== "android") {
      return {
        success: false,
        languageTag: trimmedTag,
        error: this.getPlatformError()
      };
    }

    const previousLanguageTag = await this.getCurrentLocaleTag();
    const apiLevel = await this.getAndroidApiLevel();

    const commandAttempts: CommandAttempt[] = [];
    const cmdLocaleAttempt = {
      method: "cmd locale set-locales",
      command: `shell cmd locale set-locales ${trimmedTag}`
    };
    const settingsAttempt = {
      method: "settings put system user_locale",
      command: `shell settings put system user_locale ${trimmedTag}`
    };

    if (apiLevel === null || apiLevel >= 31) {
      commandAttempts.push(cmdLocaleAttempt, settingsAttempt);
    } else {
      commandAttempts.push(settingsAttempt, cmdLocaleAttempt);
    }

    let appliedMethod: string | null = null;
    let lastError: string | null = null;

    for (const attempt of commandAttempts) {
      try {
        await this.adb.executeCommand(attempt.command);
        appliedMethod = attempt.method;
        break;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        lastError = errorMessage;
        logger.warn(`[SystemConfigurationManager] Failed locale command (${attempt.method}): ${errorMessage}`);
      }
    }

    if (!appliedMethod) {
      return {
        success: false,
        languageTag: trimmedTag,
        previousLanguageTag,
        error: `Failed to set locale${lastError ? `: ${lastError}` : ""}`
      };
    }

    const broadcasted = options.broadcast === false
      ? false
      : await this.broadcastLocaleChange();

    return {
      success: true,
      languageTag: trimmedTag,
      previousLanguageTag,
      method: appliedMethod,
      broadcasted
    };
  }

  async setTimeZone(zoneId: string): Promise<SetTimeZoneResult> {
    const trimmedZone = zoneId.trim();
    if (!trimmedZone) {
      return {
        success: false,
        zoneId,
        error: "zoneId must be a non-empty string"
      };
    }

    if (this.device.platform === "ios") {
      return this.setTimeZoneIos(trimmedZone);
    }

    if (this.device.platform !== "android") {
      return {
        success: false,
        zoneId: trimmedZone,
        error: this.getPlatformError()
      };
    }

    const previousZoneId = await this.readSetting("shell getprop persist.sys.timezone");

    try {
      await this.adb.executeCommand(`shell setprop persist.sys.timezone ${trimmedZone}`);
      return {
        success: true,
        zoneId: trimmedZone,
        previousZoneId
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        zoneId: trimmedZone,
        previousZoneId,
        error: `Failed to set time zone: ${errorMessage}`
      };
    }
  }

  async setTextDirection(rtl: boolean, options: { broadcast?: boolean } = {}): Promise<SetTextDirectionResult> {
    if (this.device.platform === "ios") {
      return {
        success: false,
        rtl,
        error: "Text direction is not supported on iOS. RTL is driven by the app's language; set an RTL locale (e.g., ar_SA) instead."
      };
    }

    if (this.device.platform !== "android") {
      return {
        success: false,
        rtl,
        error: this.getPlatformError()
      };
    }

    const debugForceRtl = await this.readSetting("shell settings get global debug.force_rtl");
    const forceRtl = await this.readSetting("shell settings get global force_rtl");
    const previousRtl = this.parseBooleanSetting(debugForceRtl ?? forceRtl);

    const targetKeys: TextDirectionSettingKey[] = [];
    const shouldSetDebug = debugForceRtl !== null || forceRtl === null;
    const shouldSetForce = forceRtl !== null;

    if (shouldSetDebug) {
      targetKeys.push("debug.force_rtl");
    }
    if (shouldSetForce) {
      targetKeys.push("force_rtl");
    }
    if (targetKeys.length === 0) {
      targetKeys.push("debug.force_rtl");
    }

    const appliedSettings: TextDirectionSettingKey[] = [];
    const value = rtl ? 1 : 0;

    for (const key of targetKeys) {
      try {
        await this.adb.executeCommand(`shell settings put global ${key} ${value}`);
        appliedSettings.push(key);
      } catch (error) {
        logger.warn(`[SystemConfigurationManager] Failed to set ${key}: ${error}`);
      }
    }

    if (appliedSettings.length === 0) {
      return {
        success: false,
        rtl,
        previousRtl,
        error: "Failed to update RTL settings"
      };
    }

    const broadcasted = options.broadcast === false
      ? false
      : await this.broadcastLocaleChange();

    return {
      success: true,
      rtl,
      previousRtl,
      settings: appliedSettings,
      broadcasted
    };
  }

  async broadcastLocaleChange(): Promise<boolean> {
    if (this.device.platform !== "android") {
      return false;
    }

    try {
      await this.adb.executeCommand("shell am broadcast -a android.intent.action.LOCALE_CHANGED");
      return true;
    } catch (error) {
      logger.warn(`[SystemConfigurationManager] Failed to broadcast localization change: ${error}`);
      return false;
    }
  }

  async set24HourFormat(enabled: boolean): Promise<Set24HourFormatResult> {
    if (this.device.platform === "ios") {
      return this.set24HourFormatIos(enabled);
    }

    if (this.device.platform !== "android") {
      return {
        success: false,
        enabled,
        error: this.getPlatformError()
      };
    }

    const previousFormat = await this.readSetting("shell settings get system time_12_24");
    const value = enabled ? "24" : "12";

    try {
      await this.adb.executeCommand(`shell settings put system time_12_24 ${value}`);
      return {
        success: true,
        enabled,
        previousFormat: this.normalizeTimeFormat(previousFormat)
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        enabled,
        previousFormat: this.normalizeTimeFormat(previousFormat),
        error: `Failed to set 24-hour format: ${errorMessage}`
      };
    }
  }

  async getCalendarSystem(): Promise<GetCalendarSystemResult> {
    if (this.device.platform === "ios") {
      return this.getCalendarSystemIos();
    }

    if (this.device.platform !== "android") {
      return {
        success: false,
        calendarSystem: DEFAULT_CALENDAR_SYSTEM,
        source: "default",
        error: this.getPlatformError()
      };
    }

    const calendarType = await this.readSetting("shell settings get system calendar_type");
    if (calendarType) {
      return {
        success: true,
        calendarSystem: calendarType,
        source: "settings.calendar_type"
      };
    }

    const locale = await this.getCurrentLocaleTag();
    if (locale) {
      const calendarFromLocale = this.extractCalendarFromLocale(locale);
      if (calendarFromLocale) {
        return {
          success: true,
          calendarSystem: calendarFromLocale,
          locale,
          source: "locale"
        };
      }
    }

    return {
      success: true,
      calendarSystem: DEFAULT_CALENDAR_SYSTEM,
      locale: locale ?? null,
      source: "default"
    };
  }

  async getLocalizationSettings(): Promise<LocalizationSettingsResult> {
    if (this.device.platform === "ios") {
      return this.getLocalizationSettingsIos();
    }

    if (this.device.platform !== "android") {
      return {
        success: false,
        error: this.getPlatformError()
      };
    }

    const locale = await this.getCurrentLocaleTag();
    const timeZone = await this.readSetting("shell getprop persist.sys.timezone");
    const timeFormat = this.normalizeTimeFormat(
      await this.readSetting("shell settings get system time_12_24")
    );
    const debugForceRtl = await this.readSetting("shell settings get global debug.force_rtl");
    const forceRtl = await this.readSetting("shell settings get global force_rtl");
    const rtlSetting = this.parseBooleanSetting(debugForceRtl) ?? this.parseBooleanSetting(forceRtl);
    const textDirection = rtlSetting === null ? null : (rtlSetting ? "rtl" : "ltr");
    const calendarResult = await this.getCalendarSystem();

    return {
      success: calendarResult.success,
      locale,
      timeZone,
      textDirection,
      timeFormat,
      calendarSystem: calendarResult.calendarSystem ?? null,
      error: calendarResult.error
    };
  }

  private async getAndroidApiLevel(): Promise<number | null> {
    try {
      const result = await this.adb.executeCommand("shell getprop ro.build.version.sdk", undefined, undefined, true);
      const parsed = Number.parseInt(result.stdout.trim(), 10);
      if (Number.isNaN(parsed)) {
        return null;
      }
      return parsed;
    } catch (error) {
      logger.warn(`[SystemConfigurationManager] Failed to read API level: ${error}`);
      return null;
    }
  }

  private getPlatformError(): string {
    return `Unsupported platform: ${this.device.platform}`;
  }

  private normalizeSettingValue(value: string | null): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed || trimmed === "null" || trimmed === "undefined") {
      return null;
    }
    return trimmed;
  }

  private normalizeTimeFormat(value: string | null): "12" | "24" | null {
    const normalized = this.normalizeSettingValue(value);
    if (normalized === "12" || normalized === "24") {
      return normalized;
    }
    return null;
  }

  private async readSetting(command: string): Promise<string | null> {
    try {
      const result = await this.adb.executeCommand(command, undefined, undefined, true);
      return this.normalizeSettingValue(result.stdout);
    } catch (error) {
      logger.warn(`[SystemConfigurationManager] Failed to read setting (${command}): ${error}`);
      return null;
    }
  }

  private parseLocaleList(value: string | null): string | null {
    const normalized = this.normalizeSettingValue(value);
    if (!normalized) {
      return null;
    }
    const primary = normalized.split(",")[0]?.trim();
    return primary || null;
  }

  private parseBooleanSetting(value: string | null): boolean | null {
    const normalized = this.normalizeSettingValue(value);
    if (normalized === null) {
      return null;
    }
    const lower = normalized.toLowerCase();
    if (lower === "1" || lower === "true") {
      return true;
    }
    if (lower === "0" || lower === "false") {
      return false;
    }
    return null;
  }

  private async getCurrentLocaleTag(): Promise<string | null> {
    const systemLocales = await this.readSetting("shell settings get system system_locales");
    const parsedSystemLocale = this.parseLocaleList(systemLocales);
    if (parsedSystemLocale) {
      return parsedSystemLocale;
    }

    const userLocale = await this.readSetting("shell settings get system user_locale");
    if (userLocale) {
      return userLocale;
    }

    const persistedLocale = await this.readSetting("shell getprop persist.sys.locale");
    if (persistedLocale) {
      return persistedLocale;
    }

    const language = await this.readSetting("shell getprop persist.sys.language");
    if (!language) {
      return null;
    }

    const country = await this.readSetting("shell getprop persist.sys.country");
    if (country) {
      return `${language}-${country}`;
    }

    return language;
  }

  private extractCalendarFromLocale(locale: string): string | null {
    const normalizedLocale = locale.trim();
    if (!normalizedLocale) {
      return null;
    }

    const keywordMatch = normalizedLocale.match(/@calendar=([a-z0-9-]+)/i);
    if (keywordMatch && keywordMatch[1]) {
      return keywordMatch[1];
    }

    const bcp47Locale = normalizedLocale.replace(/_/g, "-");
    const extensionIndex = bcp47Locale.toLowerCase().indexOf("-u-");
    if (extensionIndex === -1) {
      return null;
    }

    const extension = bcp47Locale.slice(extensionIndex + 3);
    const segments = extension.split("-").filter(Boolean);

    let index = 0;
    while (index < segments.length) {
      const key = segments[index];
      if (key.length === 2) {
        index += 1;
        const typeSegments: string[] = [];
        while (index < segments.length && segments[index].length > 2) {
          typeSegments.push(segments[index]);
          index += 1;
        }
        if (key.toLowerCase() === "ca" && typeSegments.length > 0) {
          return typeSegments.join("-");
        }
      } else {
        index += 1;
      }
    }

    return null;
  }

  // --- iOS Simulator methods ---

  private isSimulator(): boolean {
    return /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(
      this.device.deviceId
    );
  }

  private iosSpawnCommand(command: string): string {
    return `xcrun simctl spawn ${this.device.deviceId} ${command}`;
  }

  private async iosDefaultsRead(domain: string, key: string): Promise<string | null> {
    try {
      const result = await this.processExecutor.exec(
        this.iosSpawnCommand(`defaults read ${domain} ${key}`)
      );
      return this.normalizeSettingValue(result.stdout);
    } catch {
      return null;
    }
  }

  private async iosDefaultsWrite(domain: string, key: string, value: string): Promise<void> {
    await this.processExecutor.exec(
      this.iosSpawnCommand(`defaults write ${domain} ${key} ${value}`)
    );
  }

  private toAppleLocale(languageTag: string): string {
    return languageTag.replace(/-/g, "_");
  }

  private async setLocaleIos(languageTag: string): Promise<SetLocaleResult> {
    if (!this.isSimulator()) {
      return { success: false, languageTag, error: IOS_PHYSICAL_DEVICE_ERROR };
    }

    try {
      const previousLanguageTag = await this.iosDefaultsRead(".GlobalPreferences", "AppleLocale");
      const appleLocale = this.toAppleLocale(languageTag);
      await this.iosDefaultsWrite(".GlobalPreferences", "AppleLocale", appleLocale);
      return {
        success: true,
        languageTag,
        previousLanguageTag,
        method: "defaults write AppleLocale"
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        languageTag,
        error: `Failed to set locale: ${errorMessage}`
      };
    }
  }

  private async setTimeZoneIos(zoneId: string): Promise<SetTimeZoneResult> {
    if (!this.isSimulator()) {
      return { success: false, zoneId, error: IOS_PHYSICAL_DEVICE_ERROR };
    }

    try {
      const previousZoneId = await this.iosDefaultsRead(".GlobalPreferences", "AppleTimeZone");

      // Disable auto-timezone before setting
      await this.iosDefaultsWrite(
        "com.apple.mobiletimerd",
        "AutomaticTimeZoneSetting",
        "-bool NO"
      );

      await this.iosDefaultsWrite(".GlobalPreferences", "AppleTimeZone", zoneId);
      return {
        success: true,
        zoneId,
        previousZoneId
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        zoneId,
        error: `Failed to set time zone: ${errorMessage}`
      };
    }
  }

  private async set24HourFormatIos(enabled: boolean): Promise<Set24HourFormatResult> {
    if (!this.isSimulator()) {
      return { success: false, enabled, error: IOS_PHYSICAL_DEVICE_ERROR };
    }

    try {
      const previousRaw = await this.iosDefaultsRead(".GlobalPreferences", "AppleICUForce24HourTime");
      const previousFormat = this.normalizeTimeFormat(
        previousRaw === "1" ? "24" : previousRaw === "0" ? "12" : previousRaw
      );

      const boolValue = enabled ? "-bool YES" : "-bool NO";
      await this.iosDefaultsWrite(".GlobalPreferences", "AppleICUForce24HourTime", boolValue);
      return {
        success: true,
        enabled,
        previousFormat
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        enabled,
        error: `Failed to set 24-hour format: ${errorMessage}`
      };
    }
  }

  private async getCalendarSystemIos(): Promise<GetCalendarSystemResult> {
    if (!this.isSimulator()) {
      return {
        success: false,
        calendarSystem: DEFAULT_CALENDAR_SYSTEM,
        source: "default",
        error: IOS_PHYSICAL_DEVICE_ERROR
      };
    }

    const calendar = await this.iosDefaultsRead(".GlobalPreferences", "AppleCalendar");
    if (calendar) {
      return {
        success: true,
        calendarSystem: calendar,
        source: "default"
      };
    }

    const locale = await this.iosDefaultsRead(".GlobalPreferences", "AppleLocale");
    if (locale) {
      const calendarFromLocale = this.extractCalendarFromLocale(locale);
      if (calendarFromLocale) {
        return {
          success: true,
          calendarSystem: calendarFromLocale,
          locale,
          source: "locale"
        };
      }
    }

    return {
      success: true,
      calendarSystem: DEFAULT_CALENDAR_SYSTEM,
      locale: locale ?? null,
      source: "default"
    };
  }

  private async getLocalizationSettingsIos(): Promise<LocalizationSettingsResult> {
    if (!this.isSimulator()) {
      return { success: false, error: IOS_PHYSICAL_DEVICE_ERROR };
    }

    const locale = await this.iosDefaultsRead(".GlobalPreferences", "AppleLocale");
    const timeZone = await this.iosDefaultsRead(".GlobalPreferences", "AppleTimeZone");
    const timeFormatRaw = await this.iosDefaultsRead(".GlobalPreferences", "AppleICUForce24HourTime");
    const timeFormat = this.normalizeTimeFormat(
      timeFormatRaw === "1" ? "24" : timeFormatRaw === "0" ? "12" : timeFormatRaw
    );
    const calendarResult = await this.getCalendarSystemIos();

    return {
      success: true,
      locale,
      timeZone,
      textDirection: null,
      timeFormat,
      calendarSystem: calendarResult.calendarSystem ?? null
    };
  }
}
