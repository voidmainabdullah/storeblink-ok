import { describe, expect, it } from "vitest";
import { ThemeMigrationError, ThemeMigrationSystem, type ThemeDocument } from "./ThemeMigrationSystem";

describe("ThemeMigrationSystem", () => {
  it("runs every migration sequentially without mutating the source", () => {
    const system = new ThemeMigrationSystem();
    system.register({
      id: "basic-1-2",
      themeId: "basic",
      fromSchemaVersion: 1,
      toSchemaVersion: 2,
      migrate: (document) => ({
        ...document,
        schemaVersion: 2,
        payload: { ...(document.payload as object), first: true },
      }),
      validate: () => ({ valid: true, errors: [] }),
    });
    system.register({
      id: "basic-2-3",
      themeId: "basic",
      fromSchemaVersion: 2,
      toSchemaVersion: 3,
      migrate: (document) => ({
        ...document,
        schemaVersion: 3,
        payload: { ...(document.payload as object), second: true },
      }),
      validate: () => ({ valid: true, errors: [] }),
    });
    const source: ThemeDocument = {
      themeId: "basic",
      themeVersion: "1.0.0",
      schemaVersion: 1,
      payload: {},
    };

    const result = system.migrate(source, 3);
    expect(result.appliedMigrationIds).toEqual(["basic-1-2", "basic-2-3"]);
    expect(result.document).toMatchObject({
      schemaVersion: 3,
      payload: { first: true, second: true },
    });
    expect(source).toMatchObject({ schemaVersion: 1, payload: {} });
    expect(result.backup).toEqual(source);
  });

  it("refuses schema jumps when an intermediate migration is absent", () => {
    const system = new ThemeMigrationSystem();
    expect(() => system.plan("basic", 1, 3)).toThrow("Missing basic migration 1 -> 2");
  });

  it("returns an untouched backup when validation fails", () => {
    const system = new ThemeMigrationSystem();
    system.register({
      id: "basic-1-2-invalid",
      themeId: "basic",
      fromSchemaVersion: 1,
      toSchemaVersion: 2,
      migrate: (document) => ({ ...document, schemaVersion: 2, payload: { invalid: true } }),
      validate: () => ({ valid: false, errors: ["Invalid setting"] }),
    });
    const source: ThemeDocument = {
      themeId: "basic",
      themeVersion: "1.0.0",
      schemaVersion: 1,
      payload: { preserved: true },
    };

    const result = system.migrateSafely(source, 2);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.error).toBeInstanceOf(ThemeMigrationError);
      expect(result.backup).toEqual(source);
    }
    expect(source.payload).toEqual({ preserved: true });
  });
});
