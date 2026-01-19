import fs from "node:fs";

export function isRunningInDocker(): boolean {
  try {
    if (fs.existsSync("/.dockerenv")) {
      return true;
    }

    const cgroup = fs.readFileSync("/proc/1/cgroup", "utf8");
    return cgroup.includes("docker") || cgroup.includes("containerd");
  } catch {
    return false;
  }
}
