const companiesNotNeedingCustomResumes = new Set([
  "microsoft",
  "github",
  "atlassian",
]);

export function companyNeedsCustomResume(companyName: string): boolean {
  return !companiesNotNeedingCustomResumes.has(companyName.trim().toLowerCase());
}