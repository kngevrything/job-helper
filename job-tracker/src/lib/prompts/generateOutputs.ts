import { STARTER_PROMPT_TEMPLATE } from "./userConfig.local";

type GenerateOutputsInput = {
  company: string;
  jobId: string;
  jobTitle: string;
  jobUrl: string;
};

type GenerateOutputsResult = {
  excelRowText: string;
  starterPromptText: string;
};

function clean(value: string): string {
  return value.trim();
}

export function generateOutputs(
  input: GenerateOutputsInput
): GenerateOutputsResult {
  const today = new Date().toISOString().split("T")[0];
  const company = clean(input.company);
  const jobId = clean(input.jobId);
  const jobTitle = clean(input.jobTitle);
  const jobUrl = clean(input.jobUrl);

  // Legacy: tab-separated row for pasting into a tracking spreadsheet.
  // Columns: Date Of Application, Company, Job ID, Job URL, Job Title
  const excelRowText = [today, company, jobId, jobUrl, jobTitle].join("\t");

  const starterPromptText = STARTER_PROMPT_TEMPLATE(company, jobTitle);

  return {
    excelRowText,
    starterPromptText,
  };
}