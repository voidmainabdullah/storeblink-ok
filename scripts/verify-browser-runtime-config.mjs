import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const outputCandidates = [resolve("dist", "client"), resolve("dist")];
const distDirectory = outputCandidates.find((directory) =>
  existsSync(resolve(directory, ".vite", "manifest.json")),
);
if (!distDirectory) {
  throw new Error("Vite client manifest was not found. Run npm run build first.");
}

const manifest = JSON.parse(
  readFileSync(resolve(distDirectory, ".vite", "manifest.json"), "utf8"),
);
const authEntry = Object.keys(manifest).find((key) =>
  key.replaceAll("\\", "/").endsWith("src/platform/auth/AuthBoundary.tsx"),
);
if (!authEntry) {
  throw new Error("The authentication runtime is missing from the Vite manifest.");
}

const reachable = new Set();
const visit = (key) => {
  if (reachable.has(key)) return;
  const chunk = manifest[key];
  if (!chunk) throw new Error(`Manifest dependency ${key} is missing.`);
  reachable.add(key);
  (chunk.imports ?? []).forEach(visit);
};
visit(authEntry);

const source = [...reachable]
  .map((key) => manifest[key]?.file)
  .filter(Boolean)
  .map((file) => readFileSync(resolve(distDirectory, file), "utf8"))
  .join("\n");

const supabaseUrl = source.match(/https:\/\/[a-z0-9-]+\.supabase\.co/i)?.[0];
const publishableKey = source.match(/sb_publishable_[A-Za-z0-9_-]{20,}/)?.[0];

if (!supabaseUrl || !publishableKey) {
  throw new Error(
    "The built authentication runtime is missing a Supabase URL or publishable key.",
  );
}

process.stdout.write(
  `Browser authentication config verified across ${reachable.size} reachable chunks.\n`,
);
