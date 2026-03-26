import { InferSchemaType, Schema, model, models } from "mongoose";

const JobApplicationSchema = new Schema(
  {
    company: {
      type: String,
      required: true,
      trim: true,
    },
    jobId: {
      type: String,
      required: true,
      trim: true,
    },
    jobTitle: {
      type: String,
      required: true,
      trim: true,
    },
    jobUrl: {
      type: String,
      required: true,
      trim: true,
    },
    needsCustomResume: {
      type: Boolean,
      required: true,
    },
    status: {
        type: String,
        required: true,
        default: "Tailoring",
    },
    notes: {
        type: String,
        default: "",
    },
    folderPath: {
      type: String,
      default: null,
    },
    resumePath: {
      type: String,
      default: null,
    },
    coverLetterPath: {
      type: String,
      default: null,
    },
    excelRowText: {
      type: String,
      required: true,
    },
    starterPromptText: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

JobApplicationSchema.index({ company: 1, jobId: 1 }, { unique: true });

export type JobApplicationDocument = InferSchemaType<typeof JobApplicationSchema>;

export const JobApplication =
  models.JobApplication || model("JobApplication", JobApplicationSchema);