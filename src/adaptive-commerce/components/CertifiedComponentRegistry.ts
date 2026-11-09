import {
  adaptiveComponentLibrarySchema,
  type AdaptiveComponentDefinition,
  type AdaptiveComponentLibrary,
} from "../contracts/componentLibrary";

const libraryKey = (id: string, version: string): string => `${id}@${version}`;

export class CertifiedComponentRegistry {
  private readonly libraries = new Map<string, AdaptiveComponentLibrary>();

  register(library: AdaptiveComponentLibrary): () => void {
    const certified = adaptiveComponentLibrarySchema.parse(
      structuredClone(library),
    );
    const key = libraryKey(certified.id, certified.version);
    if (this.libraries.has(key)) {
      throw new Error(`Component library ${key} is already registered.`);
    }
    this.libraries.set(key, certified);
    return () => this.libraries.delete(key);
  }

  getLibrary(id: string, version: string): AdaptiveComponentLibrary | null {
    const library = this.libraries.get(libraryKey(id, version));
    return library ? structuredClone(library) : null;
  }

  getComponent(
    libraryId: string,
    libraryVersion: string,
    componentId: string,
  ): AdaptiveComponentDefinition | null {
    const component = this.libraries.get(
      libraryKey(libraryId, libraryVersion),
    )?.components[componentId];
    return component ? structuredClone(component) : null;
  }

  listLibraries(): AdaptiveComponentLibrary[] {
    return [...this.libraries.values()].map((library) =>
      structuredClone(library),
    );
  }
}

