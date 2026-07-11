import { z } from "zod";
import { APPLICATION_STATUSES } from "@/lib/status";

// company and jobId end up as path segments (applicationsRoot/company/jobId, and
// later in generated filenames), so they can't contain path separators or ".."
// -- otherwise a value like "../../Windows" lets folder/file creation escape
// applicationsRoot entirely.
function safePathSegment(label: string) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .refine((value) => !/[\\/]/.test(value), {
      message: `${label} must not contain "/" or "\\".`,
    })
    .refine((value) => !value.includes(".."), {
      message: `${label} must not contain "..".`,
    });
}

export const jobApplicationInputSchema = z.object({
  company: safePathSegment("Company"),
  jobId: safePathSegment("Job ID"),
  jobTitle: z.string().trim().min(1, "Job title is required."),
  jobUrl: z.string().trim().url("Enter a valid URL."),
  createFiles: z.boolean(),
});

export const jobApplicationStatusSchema = z.enum(APPLICATION_STATUSES);

export type JobApplicationInput = z.infer<typeof jobApplicationInputSchema>;
export type JobApplicationStatusInput = z.infer<
  typeof jobApplicationStatusSchema
>;