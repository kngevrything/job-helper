import path from "path";
import fs from "fs/promises";

type CreateApplicationFolderInput = {
  applicationsRoot: string;
  company: string;
  jobId: string;
};

type CreateApplicationFolderResult = {
  folderPath: string;
};

async function exists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function createApplicationFolder(
  input: CreateApplicationFolderInput
): Promise<CreateApplicationFolderResult> {
  const jobFolder = path.join(input.applicationsRoot, input.company, input.jobId);

  if (await exists(jobFolder)) {
    throw new Error(
      "Application folder already exists on disk. Creation cancelled to avoid overwriting files."
    );
  }

  await fs.mkdir(jobFolder, { recursive: true });

  return { folderPath: jobFolder };
}
