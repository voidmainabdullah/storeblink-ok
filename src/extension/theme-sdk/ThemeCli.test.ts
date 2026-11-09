import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  STOREBLINK_THEME_COMMANDS,
  buildTheme,
  checkTheme,
  createTheme,
  devTheme,
  packTheme,
} from "../../../scripts/theme-sdk-lib.mjs";
import { runStoreblinkCli } from "../../../scripts/storeblink.mjs";
import { assertValidThemeSdkPackage } from "./ThemeSdkPackageValidator";

const temporaryRoots: string[] = [];

const tempRoot = async () => {
  const root = await mkdtemp(path.join(tmpdir(), "storeblink-theme-sdk-"));
  temporaryRoots.push(root);
  return root;
};

afterEach(async () => {
  while (temporaryRoots.length) {
    const root = temporaryRoots.pop() as string;
    if (!path.resolve(root).startsWith(path.resolve(tmpdir()))) {
      throw new Error(`Refusing to remove non-temporary test path ${root}.`);
    }
    await rm(root, { recursive: true, force: true });
  }
});

describe("StoreBlink Theme SDK CLI", () => {
  it("exposes the complete create/check/dev/build/test/pack command surface", () => {
    expect(STOREBLINK_THEME_COMMANDS).toEqual([
      "create", "check", "dev", "build", "test", "pack",
    ]);
  });

  it("creates an immediately valid declarative scaffold with all eight routes", async () => {
    const themesRoot = await tempRoot();
    const root = await createTheme({ id: "aura", name: "Aura", themesRoot });
    const checked = await checkTheme(root);
    expect(Object.keys(checked.data.blueprints).sort()).toEqual([
      "404", "blog", "cart", "collection", "home", "page", "product", "search",
    ]);
    expect(checked.data.manifest.compiledReact).toBe(false);
    expect(checked.data.manifest.grantedCapabilities).toEqual([]);
    expect(checked.files).toContain("migrations/fixtures/preserve-merchant-heading.json");
    const built = await buildTheme(root);
    const packageValue = JSON.parse(await readFile(path.join(built.dist, "theme-package.json"), "utf8"));
    expect(() => assertValidThemeSdkPackage(packageValue)).not.toThrow();
  });

  it("produces byte-for-byte deterministic builds and packs", async () => {
    const themesRoot = await tempRoot();
    const root = await createTheme({ id: "deterministic", name: "Deterministic", themesRoot });
    const first = await packTheme(root);
    const firstBytes = await readFile(first.destination);
    const second = await packTheme(root);
    const secondBytes = await readFile(second.destination);
    expect(second.packageHash).toBe(first.packageHash);
    expect(secondBytes.equals(firstBytes)).toBe(true);
  });

  it("serves a local-only eight-route structural preview with hard security headers", async () => {
    const themesRoot = await tempRoot();
    const root = await createTheme({ id: "previewable", name: "Previewable", themesRoot });
    const built = await buildTheme(root);
    const messages: string[] = [];
    const stopPreview = await devTheme(root, {
      once: true,
      port: 0,
      log: (message: string) => messages.push(message),
    });
    const origin = messages
      .find((entry) => entry.startsWith("Local eight-route SDK preview: "))
      ?.replace("Local eight-route SDK preview: ", "");
    expect(origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    try {
      const response = await fetch(`${origin}/?route=blog`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-security-policy"))
        .toContain("connect-src 'none'");
      const html = await response.text();
      expect(html).toContain("Eight-route structural preview");
      expect(html).toContain("Preview limitation:");
      expect(html).toContain("authenticated merchant patches");
      expect(html).toContain("Blog");
      ["home", "product", "collection", "page", "blog", "cart", "search", "404"]
        .forEach((route) => expect(html).toContain(`?route=${route}`));

      const health = await fetch(`${origin}/health`).then((entry) => entry.json());
      expect(health).toMatchObject({
        kind: "storeblink-theme-preview-health",
        packageHash: built.buildManifest.packageHash,
        status: "ready",
      });
      expect(health.routes).toHaveLength(8);
    } finally {
      await stopPreview();
    }
  });

  it("fails before build/discovery when a lock is tampered or executable source is smuggled", async () => {
    const themesRoot = await tempRoot();
    const root = await createTheme({ id: "unsafe-theme", name: "Unsafe Theme", themesRoot });
    const lockPath = path.join(root, "store-kit.json");
    const lock = JSON.parse(await readFile(lockPath, "utf8"));
    lock.lockfile.blueprints.blog.integrity = `sha256:${"f".repeat(64)}`;
    await writeFile(lockPath, JSON.stringify(lock, null, 2));
    await expect(checkTheme(root)).rejects.toThrow(/blog blueprint lock is not exact/);

    const secondRoot = await createTheme({ id: "script-theme", name: "Script Theme", themesRoot });
    await writeFile(path.join(secondRoot, "runtime.js"), "fetch('https://evil.test')");
    await expect(checkTheme(secondRoot)).rejects.toThrow(/Executable source runtime.js is forbidden/);
  });

  it("supports the documented positional command syntax and a no-write dry run", async () => {
    const themesRoot = await tempRoot();
    const log = vi.fn();
    const error = vi.fn();
    const code = await runStoreblinkCli([
      "theme", "create", "dry-aura", `--themes-root=${themesRoot}`, "--dry-run",
    ], { log, error });
    expect(code).toBe(0);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("dry-aura"));
    expect(error).not.toHaveBeenCalled();

    const invalidCode = await runStoreblinkCli([
      "theme", "create", "../escape", `--themes-root=${themesRoot}`, "--dry-run",
    ], { log, error });
    expect(invalidCode).toBe(1);
    expect(error).toHaveBeenCalledWith("Theme id must use lowercase kebab-case.");
  });
});
