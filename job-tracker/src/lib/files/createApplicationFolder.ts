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

  // Defense in depth: the API layer already rejects company/jobId containing
  // path separators or "..", but this guarantees createApplicationFolder itself
  // can never write outside applicationsRoot, regardless of caller (e.g. a
  // future script or route that doesn't go through that same validation).
  const resolvedRoot = path.resolve(input.applicationsRoot);
  const resolvedFolder = path.resolve(jobFolder);
  if (
    resolvedFolder !== resolvedRoot &&
    !resolvedFolder.startsWith(resolvedRoot + path.sep)
  ) {
    throw new Error(
      "Resolved application folder is outside the applications root directory."
    );
  }

  if (await exists(jobFolder)) {
    throw new Error(
      "Application folder already exists on disk. Creation cancelled to avoid overwriting files."
    );
  }

  await fs.mkdir(jobFolder, { recursive: true });

  return { folderPath: jobFolder };
}
