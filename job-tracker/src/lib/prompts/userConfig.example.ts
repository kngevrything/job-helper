// Copy this file to userConfig.local.ts and customize for your workflow.
// userConfig.local.ts is gitignored and will not be committed.

export const STARTER_PROMPT_TEMPLATE = (
  company: string,
  jobTitle: string
) =>
  `Tailor my resume for this role.\n\n` +
  `Company: ${company}\n` +
  `Role: ${jobTitle}\n\n` +
  `My next message will contain the job description.`;
