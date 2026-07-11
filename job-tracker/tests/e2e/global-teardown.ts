import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// Stops the disposable test MongoDB started by global-setup.ts, once the
// whole e2e suite finishes (pass or fail). Data isn't wiped here (no `-v`),
// so it's still there afterward if you want to look at what a run left
// behind -- global-setup.ts clears it again at the start of the next run
// regardless.
export default async function globalTeardown() {
  await execFileAsync("docker", [
    "compose",
    "-f",
    "docker-compose.test.yml",
    "down",
  ]);
}
