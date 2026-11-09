import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const outputCandidates = [resolve("dist", "client"), resolve("dist")];
const distDirectory = outputCandidates.find((directory) =>
  existsSync(resolve(directory, ".vite", "manifest.json")),
);
if (!distDirectory) {
  throw new Error("Vite client manifest was not found. Run npm run build first.");
}
const manifestPath = resolve(distDirectory, ".vite", "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const publicRouteSources = [
  "src/pages/Store.tsx",
  "src/pages/StoreIndex.tsx",
  "src/pages/ProductDetail.tsx",
];
const publicEntries = publicRouteSources.map((source) =>
  Object.keys(manifest).find((key) => key.replaceAll("\\", "/").endsWith(source)),
);

if (publicEntries.some((entry) => !entry)) {
  throw new Error("One or more public storefront entries are missing from the Vite manifest.");
}

const reachable = new Set();
const visit = (key) => {
  if (reachable.has(key)) return;
  const chunk = manifest[key];
  if (!chunk) {
    throw new Error(`Manifest dependency ${key} is missing.`);
  }
  reachable.add(key);
  // Route siblings are dynamic imports of the application entry. They are not
  // part of the Store route's downloaded dependency graph.
  (chunk.imports ?? []).forEach(visit);
};

publicEntries.forEach(visit);

const forbiddenFiles = [
  /vendor-editor-/i,
  /vendor-supabase/i,
];
const forbiddenSource = [
  /react-moveable/i,
  /react-selecto/i,
  /@daybrush/i,
  /onAuthStateChange/i,
  /getSession/i,
  // Do not match the literal lazy chunk name "AuthProvider" in Vite's entry
  // preload map. Executable auth dependencies are caught by the session APIs
  // above and by the vendor-supabase filename check.
];
const violations = [];

reachable.forEach((key) => {
  const file = manifest[key]?.file;
  if (!file) return;
  const source = readFileSync(resolve(distDirectory, file), "utf8");
  if (
    forbiddenFiles.some((pattern) => pattern.test(file)) ||
    forbiddenSource.some((pattern) => pattern.test(source))
  ) {
    violations.push(`${key} -> ${file}`);
  }
});

if (violations.length) {
  throw new Error(
    `Public storefront imports editor-only dependencies:\n${violations.join("\n")}`,
  );
}

process.stdout.write(
  `Public bundle isolation verified across ${reachable.size} reachable chunks.\n`,
);
