import type {
  StorefrontPublicationGuard,
  StorefrontWriteInput,
  StorefrontWriteMode,
} from "@/platform/publishing/StorefrontPublishingService";
import type { ThemePolicyReport } from "./types";
import {
  ThemePolicyViolationError,
  themeProductionPolicy,
} from "./ThemeProductionPolicy";

let latestReport: ThemePolicyReport | null = null;

export const themePublicationGuard: StorefrontPublicationGuard = {
  validate(mode: StorefrontWriteMode, input: StorefrontWriteInput) {
    const report = themeProductionPolicy.auditDocument(input.document, {
      mode,
      productIds: input.context?.productIds,
    });
    latestReport = report;
    if (mode === "publish" && !report.valid) {
      throw new ThemePolicyViolationError(report);
    }
  },
};

export const getLatestThemePublicationReport = (): ThemePolicyReport | null =>
  latestReport ? structuredClone(latestReport) : null;
