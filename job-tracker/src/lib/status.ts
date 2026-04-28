
export const STATUS_GROUPS = [
  {
    label: "General",
    options: ["UNSET", "Tailoring", "Applied"],
  },
  {
    label: "Closed (No Interview)",
    options: [
      "Rejected, No Interview",
      "Closed, No Interview",
      "No Response, Job Closed",
      "Ghosted",
      "Disappeared",
    ],
  },
  {
    label: "Round 1",
    options: [
      "1st Round Scheduled",
      "1st Round Done",
      "1st Round Exit",
    ],
  },
  {
    label: "Round 2",
    options: [
      "2nd Round Scheduled",
      "2nd Round Done",
      "2nd Round Exit",
      "2nd Round, Declined to Proceed",
    ],
  },
  {
    label: "Round 3",
    options: [
      "3rd Round Scheduled",
      "3rd Round Done",
      "3rd Round Exit",
    ],
  },
  {
    label: "Round 4",
    options: [
      "4th Round Scheduled",
      "4th Round Done",
      "4th Round Exit",
    ],
  },
  {
    label: "Round 5",
    options: [
      "5th Round Scheduled",
      "5th Round Done",
      "5th Round Exit",
    ],
  },
  {
    label: "Final",
    options: [
      "Final Round Scheduled",
      "Final Round Done",
      "Final Round Exit",
    ],
  },
  {
    label: "Offer",
    options: ["Offer Received", "Accepted", "Declined Offer"],
  },
] as const

export const APPLICATION_STATUSES = STATUS_GROUPS.flatMap((group) => group.options)

export const TERMINAL_STATUSES = [
  // Round exits
  "1st Round Exit",
  "2nd Round Exit",
  "3rd Round Exit",
  "4th Round Exit",
  "5th Round Exit",
  "Final Round Exit",

  // Offer outcomes
  "Accepted",
  "Declined Offer",

  // No interview outcomes
  "Rejected, No Interview",
  "Closed, No Interview",
  "No Response, Job Closed",
  "Ghosted",
  "Disappeared",

  // Special case
  "2nd Round, Declined to Proceed",
] as const

export function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.includes(status as (typeof TERMINAL_STATUSES)[number])
}
