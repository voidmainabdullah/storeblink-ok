import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  legacyNavigationTarget,
  type MenuTarget,
  type NavigationSystem,
  type StoreRouteKey,
} from "@/content/menus";
import { EDITOR_SYSTEM_KEYS, useEngineContext } from "@/engine/kernel";
import type { StructuredProductOption } from "./StructuredInspectorFields";
import type { StructuredNavigationOption } from "./StructuredInspectorFields";

const routeOptions: Array<{ value: StoreRouteKey; label: string }> = [
  { value: "home", label: "Home" },
  { value: "products", label: "Products" },
  { value: "about", label: "About" },
  { value: "contact", label: "Contact" },
  { value: "search", label: "Search" },
  { value: "account", label: "Account" },
  { value: "cart", label: "Cart" },
  { value: "checkout", label: "Checkout" },
];

type EditableTargetType =
  | "route"
  | "product"
  | "collection"
  | "page"
  | "external"
  | "email"
  | "phone"
  | "section";

const targetFromValue = (value: unknown): MenuTarget =>
  legacyNavigationTarget(value) ?? { type: "route", routeKey: "home" };

const targetForType = (type: EditableTargetType): MenuTarget => {
  if (type === "route") return { type, routeKey: "home" };
  if (type === "section") return { type, sectionId: "" };
  if (type === "external" || type === "email" || type === "phone") {
    return { type, value: "" };
  }
  return { type, entityId: "" };
};

const selectClass =
  "h-8 w-full rounded border border-[#444] bg-[#333] px-2 text-xs text-white outline-none focus:border-[#0178ff]";

export const NavigationTargetControl = ({
  value,
  products,
  collections,
  pages,
  sections,
  onChange,
}: {
  value: unknown;
  products: StructuredProductOption[];
  collections: StructuredNavigationOption[];
  pages: StructuredNavigationOption[];
  sections: StructuredNavigationOption[];
  onChange: (target: MenuTarget) => void;
}) => {
  const engine = useEngineContext();
  const navigation = engine.resolveSystem<NavigationSystem>(
    EDITOR_SYSTEM_KEYS.navigation,
  );
  const sourceTarget = useMemo(() => targetFromValue(value), [value]);
  const [draft, setDraft] = useState<MenuTarget>(sourceTarget);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(sourceTarget);
    setError(null);
  }, [sourceTarget]);

  const commit = (target: MenuTarget) => {
    setDraft(target);
    const validation = navigation.validateTarget(target);
    if (!validation.valid) {
      setError(
        "message" in validation
          ? validation.message
          : "The destination is invalid.",
      );
      return;
    }
    setError(null);
    onChange(validation.target);
  };

  const type = draft.type as EditableTargetType;
  const destination = () => {
    if (type === "route") {
      return (
        <select
          value={draft.routeKey ?? "home"}
          aria-label="Internal store route"
          onChange={(event) =>
            commit({
              type: "route",
              routeKey: event.target.value as StoreRouteKey,
            })
          }
          className={selectClass}
        >
          {routeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }
    if (
      type === "product" ||
      type === "collection" ||
      type === "page" ||
      type === "section"
    ) {
      const options =
        type === "product"
          ? products
          : type === "collection"
            ? collections
            : type === "page"
              ? pages
              : sections;
      const currentValue =
        type === "section" ? draft.sectionId ?? "" : draft.entityId ?? "";
      return (
        <select
          value={currentValue}
          aria-label={`Linked ${type}`}
          onChange={(event) => {
            if (type === "section") {
              commit({ type, sectionId: event.target.value });
            } else {
              commit({ type, entityId: event.target.value });
            }
          }}
          className={selectClass}
        >
          <option value="">Choose {type}</option>
          {currentValue &&
          !options.some((option) => option.id === currentValue) ? (
            <option value={currentValue}>
              Missing destination ({currentValue})
            </option>
          ) : null}
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      );
    }
    const value =
      type === "external" || type === "email" || type === "phone"
          ? draft.value ?? ""
          : draft.entityId ?? "";
    const placeholder: Record<"external" | "email" | "phone", string> = {
      external: "https://example.com",
      email: "hello@example.com",
      phone: "+15551234567",
    };
    return (
      <Input
        value={value}
        aria-label="Navigation destination"
        placeholder={placeholder[type]}
        onChange={(event) => {
          const next = event.target.value;
          if (
            type === "external" ||
            type === "email" ||
            type === "phone"
          ) {
            commit({ type, value: next });
          } else {
            commit({ type, entityId: next });
          }
        }}
        className="h-8 border-[#444] bg-[#333] text-xs text-white placeholder:text-[#888]"
      />
    );
  };

  return (
    <div className="grid gap-2">
      <select
        value={type}
        aria-label="Navigation link type"
        onChange={(event) =>
          commit(targetForType(event.target.value as EditableTargetType))
        }
        className={selectClass}
      >
        <option value="route">Store route</option>
        <option value="product">Product</option>
        <option value="collection">Collection</option>
        <option value="page">Custom page</option>
        <option value="external">External URL</option>
        <option value="email">Email</option>
        <option value="phone">Telephone</option>
        <option value="section">Section anchor</option>
      </select>
      {destination()}
      {(
        (type === "product" &&
          draft.entityId &&
          !products.some((option) => option.id === draft.entityId)) ||
        (type === "collection" &&
          draft.entityId &&
          !collections.some((option) => option.id === draft.entityId)) ||
        (type === "page" &&
          draft.entityId &&
          !pages.some((option) => option.id === draft.entityId)) ||
        (type === "section" &&
          draft.sectionId &&
          !sections.some((option) => option.id === draft.sectionId))
      ) ? (
        <p role="alert" className="text-[10px] leading-4 text-[#ff8e8e]">
          This destination no longer exists. Public navigation hides this link
          until it is replaced.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-[10px] leading-4 text-[#ff8e8e]">
          {error}
        </p>
      ) : null}
    </div>
  );
};
