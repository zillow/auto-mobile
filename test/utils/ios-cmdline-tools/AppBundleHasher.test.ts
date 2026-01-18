import { describe, expect, test } from "bun:test";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { hashAppBundle } from "../../../src/utils/ios-cmdline-tools/AppBundleHasher";

const createTempDir = async (): Promise<string> => {
  return fs.mkdtemp(join(tmpdir(), "automobile-hash-"));
};

const writeFile = async (path: string, contents: string): Promise<void> => {
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.writeFile(path, contents, "utf-8");
};

describe("hashAppBundle", () => {
  test("ignores signing artifacts", async () => {
    const root = await createTempDir();
    await fs.mkdir(join(root, "_CodeSignature"), { recursive: true });
    await writeFile(join(root, "_CodeSignature", "CodeResources"), "sig");
    await writeFile(join(root, "embedded.mobileprovision"), "sig");
    await writeFile(join(root, "Info.plist"), "info");

    const first = await hashAppBundle(root);

    await writeFile(join(root, "_CodeSignature", "CodeResources"), "sig2");
    await writeFile(join(root, "embedded.mobileprovision"), "sig2");

    const second = await hashAppBundle(root);
    expect(first).toBe(second);
  });

  test("changes when app contents change", async () => {
    const root = await createTempDir();
    await writeFile(join(root, "Info.plist"), "info");

    const first = await hashAppBundle(root);
    await writeFile(join(root, "Info.plist"), "info2");
    const second = await hashAppBundle(root);

    expect(first).not.toBe(second);
  });
});
