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

async function exists(path: string) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

export async function createApplicationFiles(
  input: CreateApplicationFilesInput
): Promise<CreateApplicationFilesResult> {
  const companyFolder = path.join(input.applicationsRoot, input.company);
  const jobFolder = path.join(companyFolder, input.jobId);
  // console.log("Creating application files with input:", input);
  // console.log("Company folder path:", companyFolder);
  // console.log("Job folder path:", jobFolder);
  if (await exists(jobFolder)) {
    throw new Error(
      "Application folder already exists on disk. Creation cancelled to avoid overwriting files."
    );
  }

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
    if (await exists(destinationResumePath) || await exists(destinationCoverLetterPath)) {
      throw new Error(
        "Target resume or cover letter already exists. Aborting to prevent overwrite."
      );
    }

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