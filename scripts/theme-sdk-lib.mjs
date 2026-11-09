import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import {
  THEME_RESOURCE_TYPES,
  RESOURCE_PREFIX,
  assembleThemePackage,
  canonicalJson,
  createThemeScaffoldData,
  sha256,
} from "./theme-sdk-scaffold.mjs";

export const STOREBLINK_THEME_COMMANDS = ["create", "check", "dev", "build", "test", "pack"];

const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;
const isThemeId = (value) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const titleFromId = (id) => id.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");

const readJson = async (file) => {
  let text;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    throw new Error(`Required theme file is missing: ${file}.`, { cause: error });
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Theme file is not valid JSON: ${file}.`, { cause: error });
  }
};

const requiredSourcePaths = (migrationFixturePaths) => [
  "storeblink.theme.json",
  "design-pack.tokens.json",
  "component-library.json",
  "store-kit.json",
  ...THEME_RESOURCE_TYPES.map((resourceType) => `templates/${resourceType}.json`),
  ...migrationFixturePaths,
];

const referenceMatches = (reference, value) =>
  reference?.id === value?.id &&
  reference?.version === value?.version &&
  reference?.integrity === value?.integrity;

const integrityFor = (value) => {
  const payload = structuredClone(value);
  delete payload.integrity;
  return sha256(payload);
};

const visitStrings = (value, visitor, pathName = "$") => {
  if (typeof value === "string") {
    visitor(value, pathName);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => visitStrings(entry, visitor, `${pathName}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, entry]) => visitStrings(entry, visitor, `${pathName}.${key}`));
  }
};

const listFiles = async (root, relative = "") => {
  const directory = path.join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (["dist", "node_modules", ".git"].includes(entry.name)) continue;
    const child = path.posix.join(relative.replaceAll("\\", "/"), entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(root, child));
    else if (entry.isFile()) files.push(child);
  }
  return files;
};

export const loadThemeSource = async (themeRoot) => {
  const manifest = await readJson(path.join(themeRoot, "storeblink.theme.json"));
  const designPack = await readJson(path.join(themeRoot, "design-pack.tokens.json"));
  const componentLibrary = await readJson(path.join(themeRoot, "component-library.json"));
  const storeKit = await readJson(path.join(themeRoot, "store-kit.json"));
  const blueprints = Object.fromEntries(await Promise.all(THEME_RESOURCE_TYPES.map(async (resourceType) => [
    resourceType,
    await readJson(path.join(themeRoot, "templates", `${resourceType}.json`)),
  ])));
  const fixtureRoot = path.join(themeRoot, "migrations", "fixtures");
  const fixtureEntries = await readdir(fixtureRoot, { withFileTypes: true }).catch((error) => {
    throw new Error(`Theme migration fixture directory is missing: ${fixtureRoot}.`, { cause: error });
  });
  const migrationFixturePaths = fixtureEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => `migrations/fixtures/${entry.name}`)
    .sort();
  if (!migrationFixturePaths.length) {
    throw new Error("At least one JSON migration fixture is required.");
  }
  const migrationFixtures = await Promise.all(migrationFixturePaths.map((relative) =>
    readJson(path.join(themeRoot, relative))));
  return {
    manifest,
    designPack,
    componentLibrary,
    storeKit,
    blueprints,
    migrationFixtures,
    migrationFixturePaths,
  };
};

export const checkTheme = async (themeRoot) => {
  const root = path.resolve(themeRoot);
  const exists = await stat(root).then((entry) => entry.isDirectory()).catch(() => false);
  if (!exists) throw new Error(`Theme directory does not exist: ${root}.`);
  const data = await loadThemeSource(root);
  const errors = [];
  if (data.manifest.kind !== "storeblink-extension" || data.manifest.packageType !== "theme") {
    errors.push("storeblink.theme.json must declare a StoreBlink theme extension.");
  }
  if (!isThemeId(data.manifest.id) || data.manifest.id !== data.storeKit.id) {
    errors.push("Manifest and StoreKit must share one lowercase kebab-case id.");
  }
  if (data.manifest.trustLevel !== "platform" && data.manifest.compiledReact !== false) {
    errors.push("Compiled React is platform-only; third-party themes must be declarative.");
  }
  if (data.manifest.grantedCapabilities?.length) {
    errors.push("Source packages cannot self-grant capabilities; grants are external installation records.");
  }
  if (!referenceMatches(data.manifest.storeKit, data.storeKit)) {
    errors.push("Manifest must pin the exact included StoreKit.");
  }
  const packages = [data.designPack, data.componentLibrary, ...Object.values(data.blueprints), data.storeKit];
  packages.forEach((value) => {
    const expected = integrityFor(value);
    if (value.integrity !== expected) errors.push(`${value.kind ?? "package"} ${value.id ?? "unknown"} has stale integrity; expected ${expected}.`);
  });
  if (!referenceMatches(data.storeKit.lockfile?.designPack, data.designPack)) {
    errors.push("StoreKit DesignPack lock is not exact.");
  }
  if (!referenceMatches(data.storeKit.lockfile?.componentLibrary, data.componentLibrary)) {
    errors.push("StoreKit ComponentLibrary lock is not exact.");
  }
  THEME_RESOURCE_TYPES.forEach((resourceType) => {
    const blueprint = data.blueprints[resourceType];
    if (blueprint.resourceType !== resourceType) errors.push(`${resourceType} template declares ${blueprint.resourceType}.`);
    if (!String(blueprint.sections?.[0]?.path ?? "").startsWith(`${RESOURCE_PREFIX[resourceType]}.`)) {
      errors.push(`${resourceType} template has no canonical ${RESOURCE_PREFIX[resourceType]}.* path.`);
    }
    if (!referenceMatches(data.storeKit.lockfile?.blueprints?.[resourceType], blueprint)) {
      errors.push(`StoreKit ${resourceType} blueprint lock is not exact.`);
    }
  });
  if (!data.migrationFixtures.length) errors.push("At least one migration fixture is required.");
  if (!data.migrationFixtures.every((fixture) => fixture.expected?.candidate && fixture.merchantPatches?.length)) {
    errors.push("Migration fixtures require merchant patches and an expected candidate document.");
  }

  const files = await listFiles(root);
  if (data.manifest.trustLevel !== "platform") {
    files.filter((file) => /\.(?:js|jsx|mjs|cjs|ts|tsx)$/i.test(file) && !file.startsWith("tests/"))
      .forEach((file) => errors.push(`Executable source ${file} is forbidden in a declarative theme.`));
  }
  visitStrings(assembleThemePackage(data), (value, valuePath) => {
    if (/^(?:https?:|wss?:|javascript:)/i.test(value)) {
      errors.push(`Arbitrary remote or executable URL is forbidden at ${valuePath}.`);
    }
  });
  if (errors.length) throw new Error(`Theme check failed:\n- ${errors.join("\n- ")}`);
  return { root, data, package: assembleThemePackage(data), files };
};

export const createTheme = async ({ id, name, themesRoot }) => {
  if (!isThemeId(id)) throw new Error("Theme id must use lowercase kebab-case.");
  const root = path.resolve(themesRoot, id);
  const exists = await stat(root).then(() => true).catch(() => false);
  if (exists) throw new Error(`Theme ${id} already exists at ${root}.`);
  const data = createThemeScaffoldData({ id, name: name?.trim() || titleFromId(id) });
  const files = {
    "storeblink.theme.json": jsonText(data.manifest),
    "design-pack.tokens.json": jsonText(data.designPack),
    "component-library.json": jsonText(data.componentLibrary),
    "store-kit.json": jsonText(data.storeKit),
    ...Object.fromEntries(THEME_RESOURCE_TYPES.map((resourceType) => [
      `templates/${resourceType}.json`,
      jsonText(data.blueprints[resourceType]),
    ])),
    "migrations/fixtures/preserve-merchant-heading.json": jsonText(data.migrationFixtures[0]),
    "tests/theme-sdk.test.ts": `import { readFileSync } from "node:fs";\nimport { fileURLToPath } from "node:url";\nimport { describe, expect, it } from "vitest";\nimport { assertValidThemeSdkPackage } from "@/extension/theme-sdk";\n\ndescribe(${JSON.stringify(`${id} Theme SDK package`)}, () => {\n  it("is installable as an exact eight-route StoreKit", () => {\n    const file = fileURLToPath(new URL("../dist/theme-package.json", import.meta.url));\n    const value = assertValidThemeSdkPackage(JSON.parse(readFileSync(file, "utf8")));\n    expect(Object.keys(value.blueprints)).toHaveLength(8);\n  });\n});\n`,
    "README.md": `# ${data.manifest.name}\n\nDeclarative StoreBlink Theme SDK package.\n\n- Validate: \`storeblink theme check ${id}\`\n- Develop and preview locally: \`storeblink theme dev ${id}\`\n- Build: \`storeblink theme build ${id}\`\n- Test: \`storeblink theme test ${id}\`\n- Pack: \`storeblink theme pack ${id}\`\n\nThe local preview shows package structure and route composition; it is not the production storefront runtime. Capabilities are granted outside this source package. Compiled React is platform-only.\n`,
  };
  await Promise.all(Object.entries(files).map(async ([relative, content]) => {
    const destination = path.join(root, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content, { encoding: "utf8", flag: "wx" });
  }));
  await checkTheme(root);
  return root;
};

export const buildTheme = async (themeRoot) => {
  const checked = await checkTheme(themeRoot);
  const sourceFiles = requiredSourcePaths(checked.data.migrationFixturePaths);
  const fileHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async (relative) => [
    relative,
    sha256(await readFile(path.join(checked.root, relative))),
  ])));
  const buildManifest = {
    kind: "storeblink-theme-build",
    formatVersion: 1,
    theme: { id: checked.data.storeKit.id, version: checked.data.storeKit.version },
    files: fileHashes,
    packageHash: sha256(checked.package),
  };
  const dist = path.join(checked.root, "dist");
  await mkdir(dist, { recursive: true });
  await writeFile(path.join(dist, "theme-package.json"), `${canonicalJson(checked.package)}\n`, "utf8");
  await writeFile(path.join(dist, "build-manifest.json"), `${canonicalJson(buildManifest)}\n`, "utf8");
  return { ...checked, dist, buildManifest };
};

export const packTheme = async (themeRoot) => {
  const built = await buildTheme(themeRoot);
  const packagedFiles = ["theme-package.json", "build-manifest.json"];
  const files = Object.fromEntries(await Promise.all(packagedFiles.map(async (relative) => {
    const content = await readFile(path.join(built.dist, relative));
    return [relative, { integrity: sha256(content), content: content.toString("base64") }];
  })));
  const payload = {
    kind: "storeblink-theme-pack",
    formatVersion: 1,
    theme: built.buildManifest.theme,
    files,
  };
  const pack = { ...payload, packageHash: sha256(payload) };
  const destination = path.join(
    built.dist,
    `${built.data.storeKit.id}-${built.data.storeKit.version}.sbtheme`,
  );
  await writeFile(destination, `${canonicalJson(pack)}\n`, "utf8");
  return { destination, packageHash: pack.packageHash };
};

export const runThemeTests = async (themeRoot) => {
  const built = await buildTheme(themeRoot);
  const testFile = path.join(built.root, "tests", "theme-sdk.test.ts");
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["vitest", "run", testFile, "--maxWorkers=1"],
      { cwd: process.cwd(), stdio: "inherit", shell: false },
    );
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`Theme tests exited with ${code}.`)));
  });
};

const PREVIEW_HOST = "127.0.0.1";
const DEFAULT_PREVIEW_PORT = 4175;

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;",
})[character]);

const previewLabel = (resourceType) => resourceType === "404"
  ? "404 / Not Found"
  : resourceType[0].toUpperCase() + resourceType.slice(1);

const renderPreviewValue = (value) => escapeHtml(
  typeof value === "string" ? value : canonicalJson(value),
);

export const createThemePreviewDocument = (built, selectedResource = "home") => {
  const resourceType = THEME_RESOURCE_TYPES.includes(selectedResource)
    ? selectedResource
    : "home";
  const themePackage = built.package;
  const blueprint = themePackage.blueprints[resourceType];
  const routeLinks = THEME_RESOURCE_TYPES.map((route) =>
    `<a href="/?route=${encodeURIComponent(route)}"${route === resourceType ? ' aria-current="page"' : ""}>${escapeHtml(previewLabel(route))}</a>`).join("");
  const sections = blueprint.sections.map((section) => {
    const properties = Object.entries(section.properties)
      .map(([key, value]) => `<li><strong>${escapeHtml(key)}</strong><span>${renderPreviewValue(value)}</span></li>`)
      .join("");
    const slots = section.slots
      .map((slot) => `<li><strong>${escapeHtml(slot.slotId)}</strong><span>${renderPreviewValue(slot.value)}</span></li>`)
      .join("");
    return `<article class="section-card">
      <p class="eyebrow">${escapeHtml(section.path)}</p>
      <h2>${escapeHtml(section.properties.heading ?? section.componentId)}</h2>
      <dl><div><dt>Component</dt><dd>${escapeHtml(section.componentId)}</dd></div><div><dt>Variant</dt><dd>${escapeHtml(section.variantId)}</dd></div></dl>
      ${properties ? `<h3>Properties</h3><ul>${properties}</ul>` : ""}
      ${slots ? `<h3>Slots</h3><ul>${slots}</ul>` : ""}
    </article>`;
  }).join("");
  const lock = themePackage.storeKit.lockfile;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(themePackage.manifest.name)} · StoreBlink SDK Preview</title>
  <style>:root{color-scheme:light;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#f6f6f4;color:#171717}*{box-sizing:border-box}body{margin:0}header,main{width:min(1120px,calc(100% - 32px));margin-inline:auto}header{padding:32px 0 20px}.eyebrow{margin:0 0 8px;color:#65655f;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}h1{margin:0;font-size:clamp(28px,5vw,48px);line-height:1.05}header>p{max-width:760px;color:#52524d}.notice{margin:20px 0;padding:14px 16px;border:1px solid #c7c7bf;border-radius:10px;background:#fff}nav{display:flex;gap:8px;overflow:auto;padding:4px 0 20px}nav a{flex:none;padding:10px 14px;border:1px solid #c7c7bf;border-radius:999px;color:inherit;text-decoration:none;background:#fff}nav a[aria-current=page]{border-color:#171717;background:#171717;color:#fff}.route-head{display:flex;align-items:end;justify-content:space-between;gap:20px;margin:12px 0 20px}.route-head h2{margin:0;font-size:28px}.hash{max-width:420px;overflow-wrap:anywhere;color:#65655f;font:12px/1.4 ui-monospace,monospace}.section-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:16px;padding-bottom:36px}.section-card{padding:20px;border:1px solid #d7d7cf;border-radius:14px;background:#fff}.section-card h2{margin:0 0 16px;font-size:22px}.section-card h3{margin:18px 0 8px;font-size:13px}.section-card dl{display:grid;grid-template-columns:1fr 1fr;gap:8px}.section-card dl div,.section-card li{display:grid;gap:3px;padding:9px;border-radius:8px;background:#f5f5f1}.section-card dt,.section-card li strong{color:#65655f;font-size:11px;text-transform:uppercase}.section-card dd{margin:0}.section-card ul{display:grid;gap:6px;margin:0;padding:0;list-style:none}.lock{margin:0 0 48px;padding:20px;border-top:1px solid #d7d7cf;color:#52524d}.lock code{overflow-wrap:anywhere}footer{padding:22px 16px;background:#171717;color:#fff;text-align:center;font-size:13px}@media(max-width:640px){.route-head{align-items:start;flex-direction:column}.section-card dl{grid-template-columns:1fr}}</style>
</head>
<body data-preview-kind="structural-theme-sdk">
  <header>
    <p class="eyebrow">StoreBlink Theme SDK · local preview</p>
    <h1>${escapeHtml(themePackage.manifest.name)}</h1>
    <p>Eight-route structural preview generated from the exact built StoreKit package.</p>
    <aside class="notice" role="note"><strong>Preview limitation:</strong> this validates package structure and route composition only. It does not execute production storefront React, live catalog or checkout data, authenticated merchant patches, publication, or remote assets.</aside>
    <nav aria-label="Storefront routes">${routeLinks}</nav>
  </header>
  <main>
    <div class="route-head"><div><p class="eyebrow">${escapeHtml(blueprint.id)} · ${escapeHtml(blueprint.version)}</p><h2>${escapeHtml(previewLabel(resourceType))}</h2></div><div class="hash">Package ${escapeHtml(built.buildManifest.packageHash)}</div></div>
    <div class="section-grid">${sections || '<p class="notice">This route declares no sections.</p>'}</div>
    <p class="lock">Exact lock: DesignPack <code>${escapeHtml(`${lock.designPack.id}@${lock.designPack.version}`)}</code> · ComponentLibrary <code>${escapeHtml(`${lock.componentLibrary.id}@${lock.componentLibrary.version}`)}</code> · route integrity <code>${escapeHtml(lock.blueprints[resourceType].integrity)}</code></p>
  </main>
  <footer>Local-only SDK preview · no credentials · no outbound network dependency</footer>
</body>
</html>`;
};

const previewSecurityHeaders = Object.freeze({
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; font-src 'none'; media-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
});

const writePreviewResponse = (response, status, contentType, body, headOnly = false) => {
  response.writeHead(status, {
    ...previewSecurityHeaders,
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(headOnly ? undefined : body);
};

export const startThemePreviewServer = async (initialBuild, { port = DEFAULT_PREVIEW_PORT } = {}) => {
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error("Theme preview port must be an integer between 0 and 65535.");
  }
  let built = initialBuild;
  const server = createServer((request, response) => {
    const method = request.method ?? "GET";
    if (method !== "GET" && method !== "HEAD") {
      writePreviewResponse(response, 405, "text/plain; charset=utf-8", "Method not allowed\n", method === "HEAD");
      return;
    }
    const url = new URL(request.url ?? "/", `http://${PREVIEW_HOST}`);
    if (url.pathname === "/health") {
      const body = `${canonicalJson({
        kind: "storeblink-theme-preview-health",
        packageHash: built.buildManifest.packageHash,
        routes: THEME_RESOURCE_TYPES,
        status: "ready",
      })}\n`;
      writePreviewResponse(response, 200, "application/json; charset=utf-8", body, method === "HEAD");
      return;
    }
    if (url.pathname === "/theme-package.json") {
      const body = `${canonicalJson(built.package)}\n`;
      writePreviewResponse(response, 200, "application/json; charset=utf-8", body, method === "HEAD");
      return;
    }
    if (url.pathname !== "/") {
      writePreviewResponse(response, 404, "text/plain; charset=utf-8", "Not found\n", method === "HEAD");
      return;
    }
    const requestedRoute = url.searchParams.get("route") ?? "home";
    const selectedRoute = THEME_RESOURCE_TYPES.includes(requestedRoute) ? requestedRoute : "home";
    const body = createThemePreviewDocument(built, selectedRoute);
    writePreviewResponse(response, 200, "text/html; charset=utf-8", body, method === "HEAD");
  });
  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, PREVIEW_HOST);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Theme preview server did not bind a TCP loopback address.");
  }
  let closed = false;
  return {
    origin: `http://${PREVIEW_HOST}:${address.port}`,
    host: PREVIEW_HOST,
    port: address.port,
    update(nextBuild) {
      built = nextBuild;
    },
    close: () => new Promise((resolve, reject) => {
      if (closed) {
        resolve();
        return;
      }
      closed = true;
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
};

export const devTheme = async (
  themeRoot,
  { once = false, log = console.log, port = DEFAULT_PREVIEW_PORT } = {},
) => {
  const built = await buildTheme(themeRoot);
  log(`Theme SDK development check passed: ${built.root}`);
  const preview = await startThemePreviewServer(built, { port });
  log(`Local eight-route SDK preview: ${preview.origin}`);
  if (once) {
    log("Serving one built snapshot; file watching is disabled.");
    return () => preview.close();
  }
  let timer = null;
  let running = false;
  const watcher = watch(built.root, { recursive: true }, (_event, fileName) => {
    if (!fileName || String(fileName).startsWith("dist")) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      if (running) return;
      running = true;
      try {
        const rebuilt = await buildTheme(built.root);
        preview.update(rebuilt);
        log(`Theme SDK rebuilt after ${fileName}.`);
      } catch (error) {
        log(error instanceof Error ? error.message : String(error));
      } finally {
        running = false;
      }
    }, 120);
  });
  log("Watching declarative theme files. Press Ctrl+C to stop the local preview.");
  return async () => {
    watcher.close();
    await preview.close();
  };
};
