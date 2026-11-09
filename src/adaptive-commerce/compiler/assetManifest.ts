import { z } from "zod";
import type { JsonValue } from "@/adaptive-commerce";
import { integrityHashSchema } from "../contracts/identifiers";
import { canonicalJson } from "./canonicalJson";
import type { RuntimeAsset } from "./types";

const runtimeAssetSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["image", "svg", "video", "font", "other"]),
  url: z.string().min(1),
  integrity: integrityHashSchema.nullable(),
}).strict();

const isRecord = (value: JsonValue): value is Record<string, JsonValue> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const scanValue = (value: JsonValue, output: RuntimeAsset[]): void => {
  if (Array.isArray(value)) {
    value.forEach((entry) => scanValue(entry, output));
    return;
  }
  if (!isRecord(value)) return;
  if (Object.prototype.hasOwnProperty.call(value, "assetId")) {
    output.push(runtimeAssetSchema.parse({
      id: value.assetId,
      type: value.type,
      url: value.url,
      integrity: value.integrity ?? null,
    }));
  }
  Object.values(value).forEach((entry) => scanValue(entry, output));
};

export const compileAssetManifest = (
  explicitAssets: readonly RuntimeAsset[],
  documents: readonly JsonValue[],
): RuntimeAsset[] => {
  const candidates = explicitAssets.map((asset) => runtimeAssetSchema.parse(asset));
  documents.forEach((document) => scanValue(document, candidates));
  const byId = new Map<string, RuntimeAsset>();
  candidates.forEach((candidate) => {
    const existing = byId.get(candidate.id);
    if (existing && canonicalJson(existing) !== canonicalJson(candidate)) {
      throw new Error(`Asset ${candidate.id} resolves to conflicting immutable records.`);
    }
    byId.set(candidate.id, candidate);
  });
  return [...byId.values()].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
};
