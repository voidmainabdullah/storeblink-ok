import type { MobileMenuAnimation } from "./types";

export type MobileMenuAnimationDefinition = {
  id: MobileMenuAnimation;
  label: string;
  closedTranslate: string;
  closedScale: number;
};

class MobileMenuAnimationRegistry {
  private readonly definitions = new Map<MobileMenuAnimation, MobileMenuAnimationDefinition>();

  register(definition: MobileMenuAnimationDefinition): void {
    this.definitions.set(definition.id, { ...definition });
  }

  get(id: MobileMenuAnimation): MobileMenuAnimationDefinition {
    return this.definitions.get(id) ?? this.definitions.get("slideIn")!;
  }

  list(): MobileMenuAnimationDefinition[] {
    return [...this.definitions.values()].map((definition) => ({ ...definition }));
  }
}

export const mobileMenuAnimationRegistry = new MobileMenuAnimationRegistry();

mobileMenuAnimationRegistry.register({
  id: "slideIn",
  label: "Slide-in drawer",
  closedTranslate: "32px 0",
  closedScale: 1,
});

mobileMenuAnimationRegistry.register({
  id: "fadeScale",
  label: "Fade + scale",
  closedTranslate: "0 0",
  closedScale: 0.95,
});
