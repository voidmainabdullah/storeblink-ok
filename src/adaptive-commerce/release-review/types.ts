import { z } from "zod";

const jsonObjectSchema = z.record(z.unknown());

export const adaptiveReleaseShadowSchema = z.object({
  shadowId: z.string().min(1),
  status: z.enum(["pending", "accepted", "rejected", "uncomparable"]),
  reviewRevision: z.number().int().nonnegative(),
  structuralDiff: jsonObjectSchema,
  visualDiff: jsonObjectSchema.nullable(),
  reviewedAt: z.string().nullable(),
}).strict();

export const adaptiveReleaseReviewJobSchema = z.object({
  jobId: z.string().min(1),
  state: z.enum([
    "claimed",
    "loading-source",
    "compiling",
    "quality-gate",
    "shadowing",
    "publishing",
    "succeeded",
    "failed",
  ]),
  requestedAt: z.string().min(1),
  completedAt: z.string().nullable(),
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }).strict().nullable(),
  shadow: adaptiveReleaseShadowSchema.nullable(),
  published: z.boolean(),
  isCurrent: z.boolean(),
}).strict();

export const adaptiveReleaseReviewSnapshotSchema = z.object({
  kind: z.literal("adaptive-release-review-snapshot"),
  storeId: z.string().min(1),
  installationId: z.string().min(1),
  sourceRevision: z.number().int().positive(),
  currentPointerRevision: z.number().int().nonnegative(),
  currentPublication: z.object({
    publicationId: z.string().min(1),
    installationId: z.string().min(1),
    sourceRevision: z.number().int().positive(),
    pointerRevision: z.number().int().positive(),
  }).strict().nullable(),
  latestJob: adaptiveReleaseReviewJobSchema.nullable(),
}).strict();

export type AdaptiveReleaseShadow = z.infer<typeof adaptiveReleaseShadowSchema>;
export type AdaptiveReleaseReviewJob = z.infer<typeof adaptiveReleaseReviewJobSchema>;
export type AdaptiveReleaseReviewSnapshot = z.infer<typeof adaptiveReleaseReviewSnapshotSchema>;

export type AdaptiveReleaseReviewIdentity = Readonly<{
  storeId: string;
  installationId: string;
  sourceRevision: number;
}>;

export type AdaptiveReleaseReviewDecision = "accept" | "reject";

