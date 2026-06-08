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

    const excelRowText = [today, company, jobId, jobUrl,jobTitle].join("\t");

    const starterPromptText =
      `New tailoring session, start fresh.\n\n` +
      `Company: ${company}\n` +
      `Role: ${jobTitle}\n\n` +
      `Fit evaluation already completed. Decision: Apply. Skip re-evaluation and go straight to tailoring.\n` +
      `Go one section at a time so we can discuss changes for each one, then anything that needs adjustment for future recommendations` + 
      `can factor in that discussion.\n\n` +
      `My next message will contain the job description.` ;

    return {
        excelRowText,
        starterPromptText,
    };
}