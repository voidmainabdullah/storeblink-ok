import { Component, Fragment, type ComponentType, type ErrorInfo, type ReactNode } from "react";

export const EXTENSION_TARGETS = [
  "global-head",
  "global-body",
  "header-before",
  "header-after",
  "main-before",
  "main-after",
  "section-block",
  "product-details",
  "product-form",
  "cart-drawer",
  "footer-before",
  "footer-after",
] as const;

export type ExtensionTarget = (typeof EXTENSION_TARGETS)[number];

export type StorefrontExtensionContext = {
  pageType?: string;
  storeId?: string;
  productId?: string;
};

export type StorefrontExtensionProvenance =
  | { source: "platform" }
  | {
      source: "signed";
      publisher: string;
      keyId: string;
      signature: string;
    }
  | { source: "development" };

export type StorefrontExtension = {
  id: string;
  version: string;
  target: ExtensionTarget;
  renderer: ComponentType<{ context: StorefrontExtensionContext }>;
  supportedPageTypes?: string[];
  enabled?: (context: StorefrontExtensionContext) => boolean;
  provenance?: StorefrontExtensionProvenance;
};

export type ExtensionRegistryOptions = {
  requireTrustedExtensions?: boolean;
  maximumExtensions?: number;
  verifySignedExtension?: (
    extension: StorefrontExtension,
    provenance: Extract<StorefrontExtensionProvenance, { source: "signed" }>,
  ) => boolean;
};

export class ExtensionRegistry {
  private readonly extensions = new Map<string, StorefrontExtension>();

  constructor(private readonly options: ExtensionRegistryOptions = {}) {}

  register(extension: StorefrontExtension): () => void {
    if (!extension.id.trim()) throw new Error("Extension id is required.");
    if (this.extensions.has(extension.id)) {
      throw new Error(`Extension ${extension.id} is already registered.`);
    }
    if (this.extensions.size >= (this.options.maximumExtensions ?? 64)) {
      throw new Error(`Storefront extension limit of ${this.options.maximumExtensions ?? 64} was reached.`);
    }
    const provenance = extension.provenance ?? { source: "development" };
    if (
      this.options.requireTrustedExtensions &&
      provenance.source === "development"
    ) {
      throw new Error(`Untrusted development extension ${extension.id} is disabled in production.`);
    }
    if (provenance.source === "signed") {
      if (
        !provenance.publisher.trim() ||
        !provenance.keyId.trim() ||
        !provenance.signature.trim()
      ) {
        throw new Error(`Signed storefront extension ${extension.id} has incomplete provenance.`);
      }
      if (
        this.options.requireTrustedExtensions &&
        this.options.verifySignedExtension?.(extension, provenance) !== true
      ) {
        throw new Error(`Storefront extension ${extension.id} has an invalid or unverifiable signature.`);
      }
    }
    this.extensions.set(extension.id, extension);
    return () => {
      if (this.extensions.get(extension.id) === extension) this.extensions.delete(extension.id);
    };
  }

  resolve(target: ExtensionTarget, context: StorefrontExtensionContext): StorefrontExtension[] {
    return [...this.extensions.values()].filter((extension) => {
      if (extension.target !== target) return false;
      if (
        context.pageType &&
        extension.supportedPageTypes?.length &&
        !extension.supportedPageTypes.includes(context.pageType)
      ) {
        return false;
      }
      return extension.enabled?.(context) ?? true;
    });
  }

  clear(): void {
    this.extensions.clear();
  }
}

class ExtensionBoundary extends Component<
  { extensionId: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Storefront extension ${this.props.extensionId} failed`, error, info);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export const storefrontExtensionRegistry = new ExtensionRegistry({
  requireTrustedExtensions: import.meta.env.PROD,
});

export const ExtensionSlot = ({
  target,
  context = {},
}: {
  target: ExtensionTarget;
  context?: StorefrontExtensionContext;
}) => (
  <Fragment>
    {storefrontExtensionRegistry.resolve(target, context).map((extension) => {
      const Renderer = extension.renderer;
      return (
        <ExtensionBoundary key={extension.id} extensionId={extension.id}>
          <Renderer context={context} />
        </ExtensionBoundary>
      );
    })}
  </Fragment>
);
