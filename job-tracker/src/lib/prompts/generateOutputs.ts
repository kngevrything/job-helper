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
        `Start a new job tailoring session for ${company} – ${jobTitle}. ` +
        `Use tailoring_context.md to determine which files are authoritative. ` +
        `My next message will contain the job description.`;

    return {
        excelRowText,
        starterPromptText,
    };
}