import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { runtimeArtifactSchema, STOREFRONT_RESOURCE_TYPES } from "../src/adaptive-commerce/contracts/index.ts";
import { artifactHashFor } from "../src/adaptive-commerce/compiler/sha256.ts";
import { StorefrontCompiler } from "../src/adaptive-commerce/compiler/StorefrontCompiler.ts";
import {
  BUILT_IN_THEME_STORE_DEFINITIONS,
  BUILT_IN_THEME_STORE_KITS,
  createBuiltInAdaptiveCommerceCatalog,
} from "../src/adaptive-commerce/fixtures/builtInStoreKit.ts";
import { ADAPTIVE_QA_FIXTURES } from "../src/adaptive-commerce/qa/fixtures.ts";
import {
  ADAPTIVE_QA_MAX_WIDTH,
  ADAPTIVE_QA_MIN_WIDTH,
  runContinuousAdaptiveQa,
} from "../src/adaptive-commerce/qa/ContinuousReleaseGate.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const createdAt = "2030-01-02T03:04:05.000Z";
const expectedBlueprints = Object.freeze({
  home: "storeblink-home",
  product: "storeblink-product",
  collection: "storeblink-collection",
  page: "storeblink-page",
  blog: "storeblink-blog",
  cart: "storeblink-cart",
  search: "storeblink-search",
  "404": "storeblink-not-found",
});
const expectedComponents = Object.freeze({
  home: ["hero", "product-grid"],
  product: ["product-gallery", "product-information", "recommendations"],
  collection: ["collection-grid"],
  page: ["rich-text"],
  blog: ["blog-article"],
  cart: ["cart"],
  search: ["search-results"],
  "404": ["not-found"],
});

const fail = (message) => {
  throw new Error(`[verify:v3-release] ${message}`);
};

const asRecord = (value, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} is not an object.`);
  return value;
};

const sectionsFor = (artifact, resourceType) => {
  const document = asRecord(artifact.routes[resourceType].document, `${resourceType} document`);
  if (!Array.isArray(document.sections) || document.sections.length === 0) {
    fail(`${artifact.storeKit.id} ${resourceType} has no certified sections.`);
  }
  return document.sections;
};

const validateArtifact = (artifact) => {
  runtimeArtifactSchema.parse(artifact);
  const keys = Object.keys(artifact.routes).sort();
  const exact = [...STOREFRONT_RESOURCE_TYPES].sort();
  if (JSON.stringify(keys) !== JSON.stringify(exact)) {
    fail(`${artifact.storeKit.id} does not contain the exact eight-route contract.`);
  }
  const { artifactHash, ...content } = artifact;
  if (artifactHashFor(content) !== artifactHash) fail(`${artifact.storeKit.id} artifact hash is invalid.`);
  if (artifact.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    fail(`${artifact.storeKit.id} contains compiler error diagnostics.`);
  }
  if (JSON.stringify(artifact).includes("!important")) {
    fail(`${artifact.storeKit.id} compiled output contains forbidden !important styling.`);
  }
  for (const resourceType of STOREFRONT_RESOURCE_TYPES) {
    const route = artifact.routes[resourceType];
    if (route.blueprint.id !== expectedBlueprints[resourceType]) {
      fail(`${artifact.storeKit.id} ${resourceType} uses ${route.blueprint.id}, not its dedicated blueprint.`);
    }
    if (/(?:legacy|generic|route)[-_ ]?fallback/i.test(JSON.stringify(route.document))) {
      fail(`${artifact.storeKit.id} ${resourceType} contains a route fallback marker.`);
    }
    const componentIds = sectionsFor(artifact, resourceType).map((section) =>
      asRecord(asRecord(section, `${resourceType} section`).component, `${resourceType} component`).id);
    for (const componentId of expectedComponents[resourceType]) {
      if (!componentIds.includes(componentId)) {
        fail(`${artifact.storeKit.id} ${resourceType} is missing certified component ${componentId}.`);
      }
    }
  }
};

const sourceFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await sourceFiles(path));
    else if ([".css", ".ts", ".tsx"].includes(extname(entry.name))) result.push(path);
  }
  return result;
};

const assertNoAdaptiveImportant = async () => {
  const directory = join(root, "src", "adaptive-commerce");
  for (const path of await sourceFiles(directory)) {
    if (/\.test\.[cm]?[jt]sx?$/.test(path)) continue;
    const source = await readFile(path, "utf8");
    if (source.includes("!important")) {
      fail(`Forbidden adaptive runtime !important found in ${relative(root, path)}.`);
    }
  }
};

const legacyImportantDebt = async () => {
  let count = 0;
  for (const themeId of Object.keys(BUILT_IN_THEME_STORE_KITS)) {
    for (const path of await sourceFiles(join(root, "src", "themes", themeId))) {
      const source = await readFile(path, "utf8");
      count += source.match(/!important/g)?.length ?? 0;
    }
  }
  return count;
};

const catalog = createBuiltInAdaptiveCommerceCatalog();
const compiler = new StorefrontCompiler();
const artifacts = Object.keys(BUILT_IN_THEME_STORE_KITS).sort().map((themeId) => {
  const storeDefinition = BUILT_IN_THEME_STORE_DEFINITIONS[themeId];
  const first = compiler.compile({ registry: catalog.registry, storeDefinition, createdAt }).artifact;
  const second = compiler.compile({ registry: catalog.registry, storeDefinition, createdAt }).artifact;
  if (JSON.stringify(first) !== JSON.stringify(second)) fail(`${themeId} compilation is not deterministic.`);
  validateArtifact(first);
  return first;
});

await assertNoAdaptiveImportant();
const compatibilityImportantDebt = await legacyImportantDebt();

const qa = await runContinuousAdaptiveQa({
  artifacts,
  fixtures: ADAPTIVE_QA_FIXTURES,
  probe: ({ artifact, resourceType, width, fixture }) => {
    const issues = [];
    const document = asRecord(artifact.routes[resourceType].document, `${resourceType} document`);
    const responsive = asRecord(document.responsive, `${resourceType} responsive contract`);
    const layout = asRecord(document.layout, `${resourceType} layout contract`);
    if (width < ADAPTIVE_QA_MIN_WIDTH || width > ADAPTIVE_QA_MAX_WIDTH) {
      issues.push({ code: "qa.width.out-of-contract", severity: "blocker", message: `Width ${width} is outside the certified range.` });
    }
    if (responsive.directionModel !== "logical" || layout.logicalProperties !== true) {
      issues.push({ code: "qa.direction.physical-layout", severity: "blocker", message: `${fixture.direction} cannot use physical-only layout.` });
    }
    if (responsive.runtimeLayoutCompiler !== false || layout.freeformCompatibilityIslands !== false) {
      issues.push({ code: "qa.layout.fallback", severity: "blocker", message: "Route depends on runtime/freeform fallback layout." });
    }
    for (const rawSection of sectionsFor(artifact, resourceType)) {
      const section = asRecord(rawSection, `${resourceType} section`);
      const sectionLayout = asRecord(section.layout, `${resourceType} section layout`);
      if (sectionLayout.mode !== "certified-flow" || sectionLayout.freeform !== false) {
        issues.push({ code: "qa.layout.uncertified", severity: "blocker", message: "Section is not certified intrinsic flow." });
      }
      if (!section.accessibility || typeof section.accessibility !== "object") {
        issues.push({ code: "qa.a11y.contract-missing", severity: "blocker", message: "Section accessibility contract is missing." });
      }
    }
    return issues;
  },
});

const expectedProbeCount = artifacts.length * STOREFRONT_RESOURCE_TYPES.length *
  ADAPTIVE_QA_FIXTURES.length * (ADAPTIVE_QA_MAX_WIDTH - ADAPTIVE_QA_MIN_WIDTH + 1);
if (!qa.passed || qa.findings.length > 0) fail(`QA gate found ${qa.findings.length} issue(s).`);
if (
  qa.checkedArtifacts !== 4 || qa.checkedRoutes !== 32 || qa.checkedWidths !== 2_241 ||
  qa.checkedFixtures !== 8 || qa.probeCount !== expectedProbeCount
) fail(`QA coverage accounting is incomplete: ${JSON.stringify(qa)}.`);

console.log(JSON.stringify({
  gate: "adaptive-commerce-v3-release",
  passed: true,
  themes: Object.keys(BUILT_IN_THEME_STORE_KITS).sort(),
  artifacts: qa.checkedArtifacts,
  routes: qa.checkedRoutes,
  widths: `${ADAPTIVE_QA_MIN_WIDTH}-${ADAPTIVE_QA_MAX_WIDTH}`,
  checkedWidths: qa.checkedWidths,
  adversarialFixtures: qa.checkedFixtures,
  probes: qa.probeCount,
  forbiddenImportantDeclarations: 0,
  routeFallbacks: 0,
  legacyCompatibilityImportantDebt: compatibilityImportantDebt,
  legacyRetirementReady: compatibilityImportantDebt === 0,
}, null, 2));
