#!/usr/bin/env node
// Wraps `playwright test` so the disposable test MongoDB (docker-compose.test.yml)
// is guaranteed to be up and accepting connections *before* Playwright even starts.
//
// This exists because Playwright's own globalSetup/webServer ordering isn't
// reliable -- webServer readiness-polling can (and does) start before
// globalSetup runs, which meant the Next dev server was being polled (and
// rendering the DB-dependent dashboard page) before Mongo was ready.
// See https://github.com/microsoft/playwright/issues/7597
//
// Starts the container, waits for real readiness, runs `playwright test`
// (forwarding any CLI args), then stops the container again -- on success,
// failure, or Ctrl+C.

import { spawn, execFile } from "child_process";
import { promisify } from "util";
import { MongoClient } from "mongodb";

const execFileAsync = promisify(execFile);

const MONGODB_URI =
  process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27117/jobtracker_e2e";

async function dockerCompose(...args) {
  await execFileAsync("docker", ["compose", "-f", "docker-compose.test.yml", ...args]);
}

async function waitForMongo(uri, attempts = 30, delayMs = 1000) {
  for (let i = 0; i < attempts; i++) {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 1000 });
    try {
      await client.connect();
      await client.db().command({ ping: 1 });
      await client.close();
      return;
    } catch {
      await client.close().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error(
    `Mongo at ${uri} did not become ready within ${attempts * delayMs}ms. ` +
      "Is Docker Desktop running?"
  );
}

function runPlaywright(extraArgs) {
  return new Promise((resolve) => {
    // shell: true is required on Windows -- npx is a .cmd (batch) file there,
    // and Node's spawn() can't execute those directly without going through
    // a shell (fails with "spawn EINVAL" otherwise).
    const child = spawn("npx", ["playwright", "test", ...extraArgs], {
      stdio: "inherit",
      shell: true,
    });

    const forward = (signal) => child.kill(signal);
    process.on("SIGINT", forward);
    process.on("SIGTERM", forward);

    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function main() {
  console.log("[run-e2e] Starting disposable test MongoDB...");
  await dockerCompose("up", "-d");
  await waitForMongo(MONGODB_URI);
  console.log("[run-e2e] Mongo is ready.");

  return runPlaywright(process.argv.slice(2));
}

let exitCode = 1;
try {
  exitCode = await main();
} catch (error) {
  console.error("[run-e2e]", error);
  exitCode = 1;
} finally {
  console.log("[run-e2e] Stopping test MongoDB...");
  try {
    await dockerCompose("down");
  } catch (error) {
    console.error("[run-e2e] Failed to stop test MongoDB:", error);
  }
}

process.exit(exitCode);
