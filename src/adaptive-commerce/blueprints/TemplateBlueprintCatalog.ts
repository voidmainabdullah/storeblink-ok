import type { TemplateBlueprint, VersionedPackageRef } from "@/adaptive-commerce";
import { templateBlueprintSchema } from "../contracts/templateBlueprint";

const keyFor = (id: string, version: string): string => `${id}@${version}`;

export class TemplateBlueprintCatalog {
  private readonly blueprints = new Map<string, TemplateBlueprint>();

  register(blueprint: TemplateBlueprint): () => void {
    const parsed = templateBlueprintSchema.parse(structuredClone(blueprint));
    const key = keyFor(parsed.id, parsed.version);
    if (this.blueprints.has(key)) {
      throw new Error(`Template blueprint ${key} is already registered.`);
    }
    this.blueprints.set(key, parsed);
    return () => this.blueprints.delete(key);
  }

  resolve(reference: VersionedPackageRef): TemplateBlueprint | null {
    const blueprint = this.blueprints.get(keyFor(reference.id, reference.version));
    if (!blueprint || blueprint.integrity !== reference.integrity) return null;
    return structuredClone(blueprint);
  }

  list(): TemplateBlueprint[] {
    return [...this.blueprints.values()].map((blueprint) =>
      structuredClone(blueprint),
    );
  }
}

