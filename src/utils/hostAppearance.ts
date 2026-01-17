import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AppearanceMode } from "../models";
import { logger } from "./logger";

const execFileAsync = promisify(execFile);

type CommandResult = {
  stdout: string;
  stderr: string;
};

async function runCommand(command: string, args: string[]): Promise<CommandResult | null> {
  try {
    const result = await execFileAsync(command, args, { timeout: 2000 });
    return {
      stdout: result.stdout ? result.stdout.toString() : "",
      stderr: result.stderr ? result.stderr.toString() : "",
    };
  } catch (error) {
    return null;
  }
}

function isDarkThemeValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.includes("dark") || normalized.includes("prefer-dark");
}

export async function detectHostAppearance(): Promise<AppearanceMode> {
  if (process.platform === "darwin") {
    const result = await runCommand("defaults", ["read", "-g", "AppleInterfaceStyle"]);
    if (result && result.stdout.trim().toLowerCase() === "dark") {
      return "dark";
    }
    return "light";
  }

  if (process.platform === "linux") {
    const gnomeScheme = await runCommand("gsettings", [
      "get",
      "org.gnome.desktop.interface",
      "color-scheme",
    ]);
    if (gnomeScheme?.stdout) {
      return isDarkThemeValue(gnomeScheme.stdout) ? "dark" : "light";
    }

    const gnomeTheme = await runCommand("gsettings", [
      "get",
      "org.gnome.desktop.interface",
      "gtk-theme",
    ]);
    if (gnomeTheme?.stdout) {
      return isDarkThemeValue(gnomeTheme.stdout) ? "dark" : "light";
    }

    const kdeTheme = await runCommand("kreadconfig5", [
      "--group",
      "General",
      "--key",
      "ColorScheme",
    ]) ?? await runCommand("kreadconfig6", [
      "--group",
      "General",
      "--key",
      "ColorScheme",
    ]);
    if (kdeTheme?.stdout) {
      return isDarkThemeValue(kdeTheme.stdout) ? "dark" : "light";
    }
  }

  logger.debug("[HostAppearance] Falling back to light appearance (unsupported host)");
  return "light";
}
