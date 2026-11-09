import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RevisionConflictRecord, StartupRecoveryCandidate } from "@/persistence/recovery";
import { EditorRecoveryDialogs } from "./EditorRecoveryDialogs";

const candidate: StartupRecoveryCandidate = {
  storeId: "store-1",
  draft: {
    storeId: "store-1",
    sessionId: "session-1",
    documentVersion: 2,
    localRevision: 3,
    baseServerRevision: 4,
    document: {},
    checksum: "local",
    savedAt: "2026-08-01T00:00:00.000Z",
  },
  serverDocument: {},
  serverRevision: 5,
  commandCount: 2,
  hasServerConflict: true,
  summary: {
    localNodeCount: 12,
    serverNodeCount: 10,
    nodeDelta: 2,
    localPageCount: 3,
    serverPageCount: 2,
    pageDelta: 1,
  },
};

const conflict: RevisionConflictRecord = {
  id: "conflict-1",
  storeId: "store-1",
  sessionId: "session-1",
  localBaseRevision: 4,
  serverRevision: 5,
  localDocument: {},
  serverDocument: {},
  localChecksum: "local",
  serverChecksum: "server",
  localCommands: [],
  status: "unresolved",
  createdAt: "2026-08-01T00:00:00.000Z",
  resolvedAt: null,
};

describe("EditorRecoveryDialogs", () => {
  it("exposes restore, preview, and discard for startup recovery", () => {
    const onToggleDifferences = vi.fn();
    const onRestore = vi.fn();
    const onDiscard = vi.fn();
    render(
      <EditorRecoveryDialogs
        startupRecovery={candidate}
        revisionConflict={conflict}
        showDifferences
        onToggleDifferences={onToggleDifferences}
        onRestore={onRestore}
        onDiscard={onDiscard}
        onResolveConflict={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Unsaved work found" })).toBeInTheDocument();
    expect(screen.getByText("Local nodes")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    fireEvent.click(screen.getByRole("button", { name: "Hide differences" }));
    expect(onRestore).toHaveBeenCalledOnce();
    expect(onDiscard).toHaveBeenCalledOnce();
    expect(onToggleDifferences).toHaveBeenCalledOnce();
  });

  it("requires an explicit local or server choice for a revision conflict", () => {
    const onResolveConflict = vi.fn();
    render(
      <EditorRecoveryDialogs
        startupRecovery={null}
        revisionConflict={conflict}
        showDifferences={false}
        onToggleDifferences={vi.fn()}
        onRestore={vi.fn()}
        onDiscard={vi.fn()}
        onResolveConflict={onResolveConflict}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Keep local" }));
    fireEvent.click(screen.getByRole("button", { name: "Load server" }));
    expect(onResolveConflict).toHaveBeenNthCalledWith(1, "keep-local");
    expect(onResolveConflict).toHaveBeenNthCalledWith(2, "use-server");
  });
});

