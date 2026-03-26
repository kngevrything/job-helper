import path from "path";
import fs from "fs/promises";

type CreateApplicationFilesInput = {
  applicationsRoot: string;
  baseResumeFilename: string;
  baseCoverLetterFilename: string;
  company: string;
  jobId: string;
  needsCustomResume: boolean;
};

type CreateApplicationFilesResult = {
  folderPath: string;
  resumePath: string | null;
  coverLetterPath: string | null;
};

export async function createApplicationFiles(
  input: CreateApplicationFilesInput
): Promise<CreateApplicationFilesResult> {
  const companyFolder = path.join(input.applicationsRoot, input.company);
  const jobFolder = path.join(companyFolder, input.jobId);

  await fs.mkdir(jobFolder, { recursive: true });

  const sourceResumePath = path.join(
    input.applicationsRoot,
    input.baseResumeFilename
  );
  const sourceCoverLetterPath = path.join(
    input.applicationsRoot,
    input.baseCoverLetterFilename
  );

  const destinationResumePath = path.join(
    jobFolder,
    `Kevin Liedtke Resume ${input.jobId}.docx`
  );
  const destinationCoverLetterPath = path.join(
    jobFolder,
    `Kevin Liedtke Cover Letter ${input.jobId}.docx`
  );

  let createdResumePath: string | null = null;
  let createdCoverLetterPath: string | null = null;

  if (input.needsCustomResume) {
    await fs.copyFile(sourceResumePath, destinationResumePath);
    createdResumePath = destinationResumePath;

    await fs.copyFile(sourceCoverLetterPath, destinationCoverLetterPath);
    createdCoverLetterPath = destinationCoverLetterPath;
  }



  return {
    folderPath: jobFolder,
    resumePath: createdResumePath,
    coverLetterPath: createdCoverLetterPath,
  };
}