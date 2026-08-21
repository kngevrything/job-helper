import { APPLICATION_STATUSES } from "@/lib/status";
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
    status: {
        type: String,
        required: true,
        enum: APPLICATION_STATUSES,
        default: "UNSET",
    },
    notes: {
        type: String,
        default: "",
    },
    endedAt: {
      type: Date,
      default: null,
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

// strength: 2 = case-insensitive (still accent-sensitive) comparison,
// per MongoDB's ICU collation levels. Without this, "SecurityScorecard"
// and "Securityscorecard" compare as different values -- both to this
// unique index (letting an actual duplicate document slip in with
// different casing) and to any query that doesn't separately specify
// the same collation. Exported so both the POST route's pre-check and
// the GET check route use the exact same comparison rules the index
// itself enforces -- if those ever drifted apart, "is this a duplicate"
// could disagree between what the index allows and what a query finds.
//
// IMPORTANT: changing an existing index's options (as this did, from no
// collation to this one) is not something Mongoose/MongoDB will do for
// you automatically on a running database -- the old index has to be
// dropped and this one created in its place, and MongoDB will refuse to
// build a case-insensitive unique index at all if casing-variant
// duplicates already exist under the old index. See
// scripts/migrateCaseInsensitiveDupeIndex.js, which has to be run once,
// by hand, against the real database -- this schema change alone does
// nothing to an already-running MongoDB instance.
export const DUPLICATE_MATCH_COLLATION = { locale: "en", strength: 2 } as const;

JobApplicationSchema.index(
  { company: 1, jobId: 1 },
  { unique: true, collation: DUPLICATE_MATCH_COLLATION }
);

export type JobApplicationDocument = InferSchemaType<typeof JobApplicationSchema>;

export const JobApplication =
  models.JobApplication || model("JobApplication", JobApplicationSchema);