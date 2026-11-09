import { useEffect, useState } from "react";
import {
  Anchor,
  BringToFront,
  Copy,
  Eye,
  EyeOff,
  Layers,
  Link2,
  Lock,
  MoreHorizontal,
  SendToBack,
  Trash2,
  Unlock,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SceneNode } from "@/types";
import { InspectorIconButton } from "./InspectorControls";

export type InspectorHeaderProps = {
  node: SceneNode;
  onRename: (name: string) => void;
  onUpdateExtensions: (patch: Record<string, unknown>) => void;
  onSetHidden: (hidden: boolean) => void;
  onToggleLock: () => void;
  onCopy: () => void;
  onDuplicate: () => void;
  onMoveFront: () => void;
  onMoveBack: () => void;
  onDelete: () => void;
  onRequestClose?: () => void;
};

const toAnchor = (name: string) =>
  name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section";

export const InspectorHeader = ({
  node,
  onRename,
  onUpdateExtensions,
  onSetHidden,
  onToggleLock,
  onCopy,
  onDuplicate,
  onMoveFront,
  onMoveBack,
  onDelete,
  onRequestClose,
}: InspectorHeaderProps) => {
  const [draftName, setDraftName] = useState(node.name);
  useEffect(() => setDraftName(node.name), [node.id, node.name]);
  const anchor = typeof node.extensions?.anchor === "string" ? node.extensions.anchor : "";

  const commitName = () => {
    const next = draftName.trim();
    if (!next) {
      setDraftName(node.name);
      return;
    }
    if (next !== node.name) onRename(next);
  };

  return (
    <header className="sticky top-0 z-20 border-b border-[#414141] bg-[#2c2c2c]">
      <div className="flex h-9 items-center gap-1 px-2">
        <input
          aria-label="Element name"
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setDraftName(node.name);
              event.currentTarget.blur();
            }
          }}
          className="min-w-0 flex-1 bg-transparent px-1 text-[11px] font-semibold text-white outline-none focus:rounded focus:bg-[#383838]"
        />
        <InspectorIconButton
          icon={Anchor}
          active={Boolean(anchor)}
          title={anchor ? `Remove anchor #${anchor}` : "Create anchor"}
          onClick={() => onUpdateExtensions({ anchor: anchor ? undefined : toAnchor(node.name) })}
        />
        {node.meta.componentId ? (
          <InspectorIconButton icon={Link2} active title={`Component ${node.meta.componentId}`} />
        ) : null}
        <InspectorIconButton
          icon={node.meta.hidden ? EyeOff : Eye}
          title={node.meta.hidden ? "Show layer" : "Hide layer"}
          onClick={() => onSetHidden(!node.meta.hidden)}
        />
        <InspectorIconButton
          icon={Layers}
          title="Duplicate"
          onClick={onDuplicate}
        />
        <InspectorIconButton
          icon={node.meta.locked ? Unlock : Lock}
          active={node.meta.locked}
          title={node.meta.locked ? "Unlock layer" : "Lock layer"}
          onClick={onToggleLock}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <InspectorIconButton icon={MoreHorizontal} title="More actions" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="z-[100] min-w-44 border-[#4a4a4a] bg-[#2c2c2c] text-[11px] text-white"
          >
            <DropdownMenuItem onClick={onCopy}><Copy size={13} className="mr-2" /> Copy</DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate}><Layers size={13} className="mr-2" /> Duplicate</DropdownMenuItem>
            <DropdownMenuSeparator className="bg-[#444]" />
            <DropdownMenuItem onClick={onMoveFront}><BringToFront size={13} className="mr-2" /> Bring to front</DropdownMenuItem>
            <DropdownMenuItem onClick={onMoveBack}><SendToBack size={13} className="mr-2" /> Send to back</DropdownMenuItem>
            <DropdownMenuSeparator className="bg-[#444]" />
            <DropdownMenuItem onClick={onDelete} className="text-red-400 focus:text-red-300">
              <Trash2 size={13} className="mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <InspectorIconButton
          icon={X}
          title="Close inspector"
          onClick={onRequestClose}
          className="xl:hidden"
        />
      </div>
      <div className="flex items-center justify-between px-3 pb-2 text-[9px] text-[#949494]">
        <span>{node.type}</span>
        {anchor ? <span className="max-w-[160px] truncate text-[#70bfff]">#{anchor}</span> : null}
      </div>
    </header>
  );
};
