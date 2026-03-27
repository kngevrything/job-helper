import { z } from "zod";
import { APPLICATION_STATUSES } from "@/lib/status";

export const jobApplicationInputSchema = z.object({
  company: z.string().trim().min(1, "Company is required."),
  jobId: z.string().trim().min(1, "Job ID is required."),
  jobTitle: z.string().trim().min(1, "Job title is required."),
  jobUrl: z.string().trim().url("Enter a valid URL."),
  createFiles: z.boolean(),
});

export const jobApplicationStatusSchema = z.enum(APPLICATION_STATUSES);

export type JobApplicationInput = z.infer<typeof jobApplicationInputSchema>;
export type JobApplicationStatusInput = z.infer<
  typeof jobApplicationStatusSchema
>;