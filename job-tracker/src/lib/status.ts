export const APPLICATION_STATUSES = [
  "Tailoring",
  "Applied",
  "1st Interview Done",
  "Final Round Scheduled",
  "Rejected, No Interview",
  "Closed, No Interview",
  "1st Round Exit",
  "2nd Round Exit",
  "3rd Round Exit",
  "Final Round Exit",
  "No Response, Job Closed",
  "Ghosted",
  "Disappeared",
  "2nd Round, Declined to Proceed",
] as const

export const TERMINAL_STATUSES = [
  "Rejected, No Interview",
  "Closed, No Interview",
  "1st Round Exit",
  "2nd Round Exit",
  "3rd Round Exit",
  "Final Round Exit",
  "No Response, Job Closed",
  "Ghosted",
  "Disappeared",
  "2nd Round, Declined to Proceed",
] as const

export function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.includes(status as (typeof TERMINAL_STATUSES)[number])
}
