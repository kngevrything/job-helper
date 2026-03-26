export const JOB_APPLICATION_STATUSES = [
    "Tailoring",
    "Applied",
    "1st Interview Done",
    "1st Round Exit",
    "2nd Round Exit",
    "3rd Round Exit",
    "Final Round Scheduled",
    "Final Round Exit",
    "Made 2nd, Declined to Proceed",
    "Rejected, No Interview",
    "Closed, No Interview",
    "No Response, Job Closed",
    "Ghosted",
    "Disappeared",
  
] as const;

export type JobApplicationStatus =
  (typeof JOB_APPLICATION_STATUSES)[number];