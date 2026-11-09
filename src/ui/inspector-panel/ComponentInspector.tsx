import { useMemo, useState } from "react";
import { Boxes, Link2, RefreshCw, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ComponentSystemAPI } from "@/document/components";
import type { PageDocumentSystem } from "@/document/pages";
import { EDITOR_SYSTEM_KEYS, useEngineContext } from "@/engine/kernel";
import type { SceneNode, SceneTree } from "@/types";
import { InspectorSection } from "./InspectorControls";

export type ComponentInspectorProps = {
  node: SceneNode;
  scene: SceneTree;
  onCreate: () => void;
  onUpdateMaster: (definitionId: string) => void;
  onCreateVariant: (definitionId: string, name: string) => void;
  onCreateInstance: (definitionId: string) => void;
  onSwapVariant: (instanceRootId: string, variantId: string) => void;
  onResetOverrides: (instanceRootId: string) => void;
  onDetach: (instanceRootId: string) => void;
};

export const ComponentInspector = ({
  node,
  scene,
  onCreate,
  onUpdateMaster,
  onCreateVariant,
  onCreateInstance,
  onSwapVariant,
  onResetOverrides,
  onDetach,
}: ComponentInspectorProps) => {
  const engine = useEngineContext();
  const components = engine.resolveSystem<ComponentSystemAPI>(EDITOR_SYSTEM_KEYS.components);
  const pages = engine.resolveSystem<PageDocumentSystem>(EDITOR_SYSTEM_KEYS.pages);
  const [variantName, setVariantName] = useState("");
  const instanceRootId = components.getInstanceRootId(scene, node.id);
  const instanceRoot = instanceRootId ? scene.nodes[instanceRootId] : undefined;
  const instanceData = instanceRoot?.meta.componentInstance;
  const masterDefinitionId = node.extensions?.componentRole === "definition"
    ? String(node.extensions.componentDefinitionId ?? "")
    : "";
  const definitionId = instanceData?.componentDefinitionId ?? masterDefinitionId;
  const definition = definitionId ? scene.components?.definitions[definitionId] : undefined;
  const impact = useMemo(() => {
    if (!definitionId) return null;
    try {
      const snapshot = pages.getSnapshot();
      return components.getImpact(
        definitionId,
        snapshot.document.pages.map((page) => ({
          pageId: page.id,
          scene: page.id === snapshot.activePageId ? scene : page.scene,
        })),
      );
    } catch {
      return components.getImpact(definitionId, [{ pageId: "active", scene }]);
    }
  }, [components, definitionId, pages, scene]);
  const canCreate = !definitionId && !instanceRootId &&
    Boolean(node.parentId) && ["container", "section"].includes(node.type);

  if (!canCreate && !definition) return null;

  return (
    <InspectorSection title="Component" defaultOpen>
      {canCreate ? (
        <Button
          type="button"
          variant="outline"
          className="h-8 w-full border-[#4a4a4a] bg-transparent text-[10px] text-white hover:bg-white/10"
          onClick={onCreate}
        >
          <Boxes className="mr-1.5 h-3.5 w-3.5" />
          Create component
        </Button>
      ) : null}

      {definition ? (
        <div className="space-y-2">
          <div className="rounded border border-[#464646] bg-[#383838] px-2 py-2">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-white">
              <Link2 className="h-3.5 w-3.5 text-[#0d99ff]" />
              {definition.name}
            </div>
            <div className="mt-1 text-[9px] leading-4 text-[#aaa]">
              {instanceData
                ? `${instanceData.overrides.length} controlled override${instanceData.overrides.length === 1 ? "" : "s"}`
                : `${impact?.instanceCount ?? 0} instance${impact?.instanceCount === 1 ? "" : "s"} across ${impact?.pageCount ?? 0} page${impact?.pageCount === 1 ? "" : "s"}`}
            </div>
          </div>

          {instanceData && instanceRootId ? (
            <>
              <label className="block text-[9px] uppercase text-[#9a9a9a]">
                Variant
                <select
                  aria-label="Component variant"
                  className="mt-1 h-8 w-full rounded border border-[#4a4a4a] bg-[#383838] px-2 text-[10px] normal-case text-white outline-none focus:border-[#0d99ff]"
                  value={instanceData.variantId}
                  onChange={(event) => onSwapVariant(instanceRootId, event.target.value)}
                >
                  {Object.values(definition.variants).map((variant) => (
                    <option key={variant.id} value={variant.id}>{variant.name}</option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 border-[#4a4a4a] bg-transparent px-1 text-[9px] text-white hover:bg-white/10"
                  disabled={!instanceData.overrides.length}
                  onClick={() => onResetOverrides(instanceRootId)}
                >
                  <RefreshCw className="mr-1 h-3 w-3" />
                  Reset
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 border-[#4a4a4a] bg-transparent px-1 text-[9px] text-white hover:bg-white/10"
                  onClick={() => onDetach(instanceRootId)}
                >
                  <Unlink className="mr-1 h-3 w-3" />
                  Detach
                </Button>
              </div>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                className="h-8 w-full border-[#0d99ff] bg-[#0d99ff]/10 text-[10px] text-white hover:bg-[#0d99ff]/20"
                onClick={() => onUpdateMaster(definition.id)}
              >
                Update master
              </Button>
              {node.extensions?.sharedChromeRole ? null : (
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 w-full border-[#4a4a4a] bg-transparent text-[10px] text-white hover:bg-white/10"
                  onClick={() => onCreateInstance(definition.id)}
                >
                  Create instance
                </Button>
              )}
              <div className="flex gap-1.5">
                <Input
                  value={variantName}
                  aria-label="New variant name"
                  placeholder="Variant name"
                  className="h-8 border-[#4a4a4a] bg-[#383838] px-2 text-[10px] text-white"
                  onChange={(event) => setVariantName(event.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 border-[#4a4a4a] bg-transparent px-2 text-[9px] text-white hover:bg-white/10"
                  disabled={!variantName.trim()}
                  onClick={() => {
                    onCreateVariant(definition.id, variantName.trim());
                    setVariantName("");
                  }}
                >
                  Add
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </InspectorSection>
  );
};
