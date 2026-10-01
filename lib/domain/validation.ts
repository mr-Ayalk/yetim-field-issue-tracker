import { z } from "zod";
import {
  CATEGORIES,
  enumTuple,
  PRIORITIES,
  ROLES,
  STATUSES,
} from "@/lib/domain/constants";
import { fail, type FieldErrors, type Result } from "@/lib/domain/types";

const categorySchema = z.enum(enumTuple(CATEGORIES), { message: "Category is required" });
const prioritySchema = z.enum(enumTuple(PRIORITIES), { message: "Priority is required" });
const roleSchema = z.enum(enumTuple(ROLES));

function fieldErrors(error: z.ZodError): FieldErrors {
  const fields: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "form";
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export function validationFailure(error: z.ZodError): Result<never> {
  const fields = fieldErrors(error);
  const message = Object.values(fields)[0] ?? "Check the highlighted fields.";
  return fail(422, "VALIDATION_ERROR", message, "VALIDATION", { fields });
}

const reportedAtSchema = z
  .string({ message: "Reported date/time is required" })
  .min(1, "Reported date/time is required")
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date/time");

export const createReportSchema = z.object({
  clientId: z.string().uuid("A valid clientId is required."),
  category: categorySchema,
  description: z
    .string({ message: "Description is required" })
    .trim()
    .min(1, "Description is required")
    .max(4000, "Description is too long.")
    .refine((value) => value.length >= 10, "Description must be at least 10 characters."),
  location: z
    .string({ message: "Location is required" })
    .trim()
    .min(1, "Location is required")
    .max(300, "Location is too long.")
    .refine((value) => value.length >= 2, "Location is required"),
  priority: prioritySchema,
  status: z.literal("SUBMITTED", {
    message: "Only submitted reports can be sent to the server. Save drafts on this device.",
  }),
  reportedAt: reportedAtSchema,
  reportedTimezone: z.string().trim().max(80).optional(),
  reporterName: z.string().trim().max(80).optional(),
  latitude: z.number().gte(-90).lte(90).nullable().optional(),
  longitude: z.number().gte(-180).lte(180).nullable().optional(),
  accuracyMeters: z.number().positive().max(100_000).nullable().optional(),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;

export const draftSchema = z.object({
  clientId: z.string().uuid("A valid clientId is required."),
  category: categorySchema.optional(),
  description: z.string().trim().max(4000).optional(),
  location: z.string().trim().max(300).optional(),
  priority: prioritySchema.optional(),
  reportedAt: z.string().optional(),
  reportedTimezone: z.string().trim().max(80).optional(),
  reporterName: z.string().trim().max(80).optional(),
  latitude: z.number().gte(-90).lte(90).nullable().optional(),
  longitude: z.number().gte(-180).lte(180).nullable().optional(),
  accuracyMeters: z.number().positive().max(100_000).nullable().optional(),
});

export const statusChangeSchema = z.object({
  to: z.enum(enumTuple(STATUSES)),
  baseVersion: z.number().int().positive(),
  assigneeName: z.string().trim().min(1).max(80).optional(),
  reason: z.string().trim().max(500).optional(),
  resolution: z.enum(["APPLY_LOCAL"]).optional(),
  clientOperationId: z.string().uuid().optional(),
});

export type StatusChangeInput = z.infer<typeof statusChangeSchema>;

export const updateReportSchema = z
  .object({
    baseVersion: z.number().int().positive(),
    category: categorySchema.optional(),
    description: z.string().trim().min(10).max(4000).optional(),
    location: z.string().trim().min(2).max(300).optional(),
    priority: prioritySchema.optional(),
    assigneeName: z.string().trim().max(80).nullable().optional(),
    latitude: z.number().gte(-90).lte(90).nullable().optional(),
    longitude: z.number().gte(-180).lte(180).nullable().optional(),
    accuracyMeters: z.number().positive().max(100_000).nullable().optional(),
    resolution: z.enum(["APPLY_LOCAL"]).optional(),
    clientOperationId: z.string().uuid().optional(),
  })
  .refine(
    (value) =>
      value.category !== undefined ||
      value.description !== undefined ||
      value.location !== undefined ||
      value.priority !== undefined ||
      value.assigneeName !== undefined ||
      value.latitude !== undefined ||
      value.longitude !== undefined ||
      value.accuracyMeters !== undefined,
    { message: "Provide at least one field to update.", path: ["form"] },
  );

export type UpdateReportInput = z.infer<typeof updateReportSchema>;

export const listQuerySchema = z.object({
  status: z.enum(STATUSES).optional(),
  priority: prioritySchema.optional(),
  category: categorySchema.optional(),
  q: z.string().trim().max(200).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
  reporterName: z.string().trim().max(80).optional(),
  sort: z.enum(["reportedAt", "updatedAt", "priority"]).default("reportedAt"),
  direction: z.enum(["asc", "desc"]).default("desc"),
});

export const attachmentSchema = z.object({
  clientAttachmentId: z.string().uuid(),
  fileName: z.string().trim().min(1).max(180),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"], {
    message: "Use a JPEG, PNG, or WebP image.",
  }),
  checksum: z.string().trim().min(32).max(128),
  contentBase64: z.string().min(1),
});

export const syncOperationSchema = z.object({
  clientOperationId: z.string().uuid(),
  type: z.enum([
    "CREATE_REPORT",
    "UPDATE_REPORT",
    "CHANGE_STATUS",
    "UPLOAD_ATTACHMENT",
    "RESOLVE_CONFLICT",
  ]),
  reportClientId: z.string().uuid(),
  baseVersion: z.number().int().positive().optional(),
  payload: z.unknown(),
});

export const syncBatchSchema = z.object({
  operations: z.array(syncOperationSchema).min(1).max(50),
});

export function parseRoleHeader(value: string | null): z.infer<typeof roleSchema> {
  const parsed = roleSchema.safeParse(value);
  return parsed.success ? parsed.data : "FIELD_WORKER";
}

export { fieldErrors };
