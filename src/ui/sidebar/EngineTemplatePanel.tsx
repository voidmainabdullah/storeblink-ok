import { useState } from "react";
import { Check, LoaderCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type {
  EngineSceneTemplateId,
  EngineSceneTemplateMeta,
} from "@/editor/engine/engineTemplates";

export type EditorPublicationRecoveryPoint = Readonly<{
  id: string;
  sourceId: string;
  source: "session" | "server";
  revision: number;
  createdAt: string;
  label: string;
}>;

type EngineTemplatePanelProps = {
  templates: readonly EngineSceneTemplateMeta[];
  activeTemplateId: EngineSceneTemplateId | null;
  applyingTemplateId: EngineSceneTemplateId | null;
  onApply: (templateId: EngineSceneTemplateId) => void;
  activePageName?: string;
  applicationBlockedReason?: string | null;
  recoveryPoints?: readonly EditorPublicationRecoveryPoint[];
  restoringRecoveryPointId?: string | null;
  onRestore?: (recoveryPointId: string) => void;
};

const TemplateFallbackPreview = () => (
  <div className="h-[148px] bg-white p-3">
    <div className="mb-3 flex items-center justify-between">
      <div className="h-2 w-12 rounded-full bg-black" />
      <div className="flex gap-1">
        <div className="h-2 w-8 rounded-full bg-[#e8e8e8]" />
        <div className="h-2 w-8 rounded-full bg-[#e8e8e8]" />
        <div className="h-2 w-8 rounded-full bg-[#e8e8e8]" />
      </div>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <div className="rounded bg-[#f1f1f1] p-3">
        <div className="mx-auto h-2 w-20 rounded bg-black" />
        <div className="mx-auto mt-1 h-2 w-24 rounded bg-black" />
        <div className="mt-5 flex gap-1">
          <div className="h-3 w-8 rounded-full border border-black" />
          <div className="h-3 w-8 rounded-full border border-[#bbb]" />
        </div>
        <div className="mt-3 h-7 rounded bg-white" />
      </div>
      <div className="relative rounded bg-[#c8c8c8]">
        <div className="absolute bottom-2 left-2 right-2 h-7 rounded bg-[#8f8f8f]" />
      </div>
    </div>
    <div className="mt-3 grid grid-cols-3 gap-2">
      <div className="h-9 rounded bg-[#c8c8c8]" />
      <div className="h-9 rounded bg-[#c8c8c8]" />
      <div className="h-9 rounded bg-[#c8c8c8]" />
    </div>
  </div>
);

export const EngineTemplatePanel = ({
  templates,
  activeTemplateId,
  applyingTemplateId,
  onApply,
  activePageName = "Current page",
  applicationBlockedReason = null,
  recoveryPoints = [],
  restoringRecoveryPointId = null,
  onRestore,
}: EngineTemplatePanelProps) => {
  const [pendingTemplateId, setPendingTemplateId] =
    useState<EngineSceneTemplateId | null>(null);
  const pendingTemplate = templates.find(
    (template) => template.id === pendingTemplateId,
  );
  const reviewTemplate = (templateId: EngineSceneTemplateId) => {
    if (
      templateId === activeTemplateId ||
      applyingTemplateId ||
      applicationBlockedReason
    ) return;
    setPendingTemplateId(templateId);
  };

  return (
    <div className="space-y-3" data-engine-template-catalog>
      <div className="flex items-center justify-between gap-3 px-1 text-[11px] text-[#aaa]">
        <span>{templates.length} themes available</span>
        <span className="truncate">For {activePageName}</span>
      </div>
      {applicationBlockedReason ? (
        <p
          role="status"
          className="rounded-md border border-amber-400/35 bg-amber-400/10 px-3 py-2.5 text-xs leading-5 text-amber-100"
        >
          {applicationBlockedReason}
        </p>
      ) : null}
      {templates.map((template) => {
        const active = template.id === activeTemplateId;
        const applying = template.id === applyingTemplateId;
        const preview = (
          <>
            {template.previewImage ? (
              <img
                src={template.previewImage}
                alt={`${template.name} theme preview`}
                loading={template.badge ? "eager" : "lazy"}
                className="h-[148px] w-full object-cover"
              />
            ) : (
              <TemplateFallbackPreview />
            )}
            {active ? (
              <span className="absolute left-2.5 top-2.5 inline-flex h-7 items-center gap-1.5 rounded-md bg-[#0178ff] px-2.5 text-[11px] font-semibold text-white">
                <Check size={13} /> Current
              </span>
            ) : template.badge ? (
              <span className="absolute left-2.5 top-2.5 rounded-md bg-[#171717] px-2.5 py-1.5 text-[11px] font-semibold text-white">
                {template.badge}
              </span>
            ) : null}
          </>
        );
        return (
          <article
            key={template.id}
            data-template-id={template.id}
            data-template-active={active ? "true" : "false"}
            className={`rounded-lg border bg-[#242424] p-2.5 ${
              active ? "border-[#168bff]" : "border-[#444]"
            }`}
          >
            {active ? (
              <div
                className="relative block w-full overflow-hidden rounded-md border border-[#168bff] bg-[#efefef]"
                aria-label={`${template.name} is the current theme for ${activePageName}`}
              >
                {preview}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => reviewTemplate(template.id)}
                disabled={Boolean(applyingTemplateId) || Boolean(applicationBlockedReason)}
                className="relative block w-full overflow-hidden rounded-md border border-[#555] bg-[#efefef] text-left transition-colors hover:border-[#888] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#168bff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#242424] disabled:cursor-not-allowed disabled:opacity-60"
                aria-label={`View ${template.name} theme details`}
              >
                {preview}
              </button>
            )}
            <div className="mt-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">{template.name}</div>
                {template.category?.length ? (
                  <div className="mt-1 truncate text-[11px] font-medium text-[#79bfff]">
                    {template.category.join(" · ")}
                  </div>
                ) : null}
                <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-[#c1c1c1]">
                  {template.description}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant={active ? "outline" : "default"}
                className={active
                  ? "h-9 shrink-0 border-[#555] bg-transparent px-3 text-xs text-[#c8c8c8]"
                  : "h-9 shrink-0 bg-[#0178ff] px-3 text-xs text-white hover:bg-[#0b86df]"}
                onClick={() => reviewTemplate(template.id)}
                disabled={active || Boolean(applyingTemplateId) || Boolean(applicationBlockedReason)}
                aria-label={active ? `${template.name} is current` : `Review ${template.name}`}
              >
                {applying ? (
                  <>
                    <LoaderCircle size={14} className="mr-1.5 animate-spin" />
                    Applying
                  </>
                ) : active ? (
                  "Current"
                ) : applicationBlockedReason ? (
                  "Unavailable"
                ) : (
                  "Review"
                )}
              </Button>
            </div>
          </article>
        );
      })}
      {onRestore && recoveryPoints.length ? (
        <section className="rounded-lg border border-[#444] bg-[#242424] p-3" aria-label="Publication recovery">
          <div className="mb-2 px-1">
            <div className="text-xs font-semibold text-white">Publication recovery</div>
            <div className="mt-1 text-[11px] leading-4 text-[#aaa]">Restore as a new validated revision</div>
          </div>
          <div className="space-y-1.5">
            {recoveryPoints.slice(0, 5).map((point) => {
              const restoring = point.id === restoringRecoveryPointId;
              return (
                <div
                  key={point.id}
                  className="flex items-center gap-2 rounded-md border border-[#3d3d3d] bg-[#202020] px-2.5 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-[#ededed]">
                      Revision {point.revision}
                    </div>
                    <div className="truncate text-[11px] text-[#999]">
                      {point.label} - {point.source === "server" ? "Durable" : "This session"}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 px-2.5 text-[11px] text-[#d1d1d1] hover:bg-white/10 hover:text-white"
                    disabled={Boolean(restoringRecoveryPointId)}
                    onClick={() => onRestore(point.id)}
                  >
                    {restoring ? (
                      <LoaderCircle size={13} className="animate-spin" />
                    ) : (
                      <RotateCcw size={13} />
                    )}
                    Restore
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <AlertDialog
        open={Boolean(pendingTemplate)}
        onOpenChange={(open) => {
          if (!open) setPendingTemplateId(null);
        }}
      >
        <AlertDialogContent className="border-[#444] bg-[#202020] text-white sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg text-white">
              Apply {pendingTemplate?.name} to {activePageName}?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-sm leading-6 text-[#c5c5c5]">
              <span className="block">
                This replaces the editable design for <strong className="font-semibold text-white">{activePageName}</strong> only.
              </span>
              <span className="block">
                Other store pages and storefront routes are not changed. You can undo this change from the editor after it is applied.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-10 border-[#555] bg-transparent text-sm text-white hover:bg-white/10 hover:text-white">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="h-10 bg-[#0178ff] text-sm text-white hover:bg-[#0b86df]"
              disabled={!pendingTemplate || Boolean(applyingTemplateId)}
              onClick={() => {
                if (pendingTemplate) onApply(pendingTemplate.id);
              }}
            >
              Apply to {activePageName}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
