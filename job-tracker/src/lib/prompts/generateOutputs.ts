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
      `Forget previous tailorings, start fresh with this job:\n\n` +
      `Company: ${company}\n` +
      `Role: ${jobTitle}\n\n` +
      `Use tailoring_context.md to determine which files are authoritative. ` +
      `Use resume_master.md as the only source for current resume wording. ` +
      `Before tailoring, evaluate the role fit using Core Requirements, Soft Skills & Leadership, and Responsibilities / Day-to-Day Fit. ` +
      `Flag real gaps, partial matches, and truthful bridges based only on my actual background. ` +
      `Only use portfolio reference files if the role asks for a portfolio, product design, UX design, design engineering, case studies, visual/UI craft, or similar evidence. ` +
      `My next message will contain the job description.`;

    return {
        excelRowText,
        starterPromptText,
    };
}