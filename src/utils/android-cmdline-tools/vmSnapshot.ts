import { ExecResult } from "../../models";

type VmSnapshotAction = "save" | "load";

const OK_TOKEN = /\bOK\b/;
const KO_TOKEN = /\bKO\b/;

export function buildVmSnapshotCommand(action: VmSnapshotAction, snapshotName: string): string {
  return `emu avd snapshot ${action} ${snapshotName}`;
}

export function evaluateVmSnapshotResult(
  action: VmSnapshotAction,
  snapshotName: string,
  result: ExecResult
): { ok: boolean; errorMessage?: string } {
  const output = combineVmSnapshotOutput(result.stdout, result.stderr);
  const upper = output.toUpperCase();
  const hasKo = KO_TOKEN.test(upper);
  if (hasKo) {
    return { ok: false, errorMessage: buildVmSnapshotErrorMessage(action, snapshotName, output) };
  }
  const hasOk = OK_TOKEN.test(upper);
  if (hasOk) {
    return { ok: true };
  }
  const detail = output ? `unexpected response: ${output}` : "no response from emulator";
  return { ok: false, errorMessage: buildVmSnapshotErrorMessage(action, snapshotName, detail) };
}

export function formatVmSnapshotExecutionError(
  action: VmSnapshotAction,
  snapshotName: string,
  error: unknown
): string {
  const detail = describeVmSnapshotError(error);
  return buildVmSnapshotErrorMessage(action, snapshotName, detail);
}

function buildVmSnapshotErrorMessage(
  action: VmSnapshotAction,
  snapshotName: string,
  detail: string
): string {
  const trimmed = detail.trim();
  const cleaned = trimmed.replace(/^KO[:\s]*/i, "").trim();
  const lower = cleaned.toLowerCase();
  const base = `VM snapshot ${action} failed for '${snapshotName}'`;

  if (!cleaned) {
    return `${base}: no response from emulator`;
  }

  if (lower.includes("timed out") || lower.includes("timeout")) {
    return `${base}: command timed out (${cleaned})`;
  }
  if (lower.includes("device offline") || lower.includes("offline")) {
    return `${base}: emulator is offline or not responding (${cleaned})`;
  }
  if (lower.includes("device not found") || lower.includes("no devices") || lower.includes("no emulators")) {
    return `${base}: emulator not found (${cleaned})`;
  }
  if (lower.includes("unknown command") || lower.includes("not supported") || lower.includes("unknown avd")) {
    return `${base}: emulator does not support snapshot commands (${cleaned})`;
  }
  if (lower.includes("snapshot") && (lower.includes("not found") || lower.includes("does not exist"))) {
    return `${base}: snapshot not found (${cleaned})`;
  }

  return `${base}: ${cleaned}`;
}

function combineVmSnapshotOutput(stdout: string, stderr: string): string {
  return [stdout, stderr]
    .filter(part => part && part.trim().length > 0)
    .join("\n")
    .trim();
}

function describeVmSnapshotError(error: unknown): string {
  if (error instanceof Error) {
    const errorWithOutput = error as Error & { stdout?: string; stderr?: string };
    return [error.message, errorWithOutput.stdout, errorWithOutput.stderr].filter(Boolean).join("\n");
  }
  return String(error);
}
