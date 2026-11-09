import { describe, expect, it } from "vitest";
import type { Project } from "@/types";
import { CURRENT_SCHEMA_VERSION, jsonToProject, migrate, projectToJson, projectToObject } from "./index";

const project: Project = {
  id: "project-1",
  schemaVersion: CURRENT_SCHEMA_VERSION,
  name: "Storefront",
  pages: [{ id: "page-1", name: "Home", rootNodeId: "root" }],
  assets: [],
  preferences: { autosave: true },
  metadata: { createdAt: 100, updatedAt: 200 },
};

describe("project serialization", () => {
  it("round-trips Project -> JSON -> Project", () => {
    expect(jsonToProject(projectToJson(project))).toEqual(project);
  });

  it("validates current projects through the ordered migration registry", () => {
    expect(migrate(project)).toEqual(project);
    expect(projectToObject(project)).toEqual(project);
  });

  it("migrates a real v1 project without mutating its source", () => {
    const v1 = { ...project, schemaVersion: 1 };
    const migrated = migrate(v1);
    expect(migrated.schemaVersion).toBe(2);
    expect(v1.schemaVersion).toBe(1);
  });

  it("rejects unknown future project versions", () => {
    expect(() => migrate({ ...project, schemaVersion: 99 })).toThrow(
      "newer than supported",
    );
  });
});
