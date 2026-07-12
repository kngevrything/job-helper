# Job Tracker — Testing Report

Date: 2026-07-11 (updated after follow-up fixes and a confirmed passing e2e run)

## How this was done

Static analysis (lint, `tsc --noEmit`, `next build`) ran directly against the repo. For everything else, I worked in an isolated copy of the repo in a sandbox, not your real working copy — see "Sandbox limitations" below for why.

I added a permanent automated test suite to the repo (63 unit/integration tests + 8 Playwright e2e tests). All 63 unit/integration tests pass. All 8 e2e tests have since been run and confirmed passing against the real app (see "Fixed during this engagement" below) — the sandbox limitation below only describes what I could run myself.

### Sandbox limitations

My sandbox's network is allowlisted and blocks every source for downloading a MongoDB server binary (fastdl.mongodb.org, repo.mongodb.org, npm mirrors), and there's no Docker or root access. I could not run a real MongoDB myself, and your homelab Mongo isn't reachable from here (private IP). So:

- Unit tests for pure logic (validation, status rules, file/folder creation, output generation) run against the real code, no mocking.
- API route tests run the real route handlers with a small hand-written in-memory stand-in for the Mongoose model (`tests/mocks/fakeJobApplication.ts`), not real MongoDB. It correctly emulates the unique-index behavior your app depends on, but it isn't MongoDB — genuine driver/network edge cases aren't covered.
- True end-to-end UI tests (Playwright, `tests/e2e/`) needed to be run on your machine, where Docker/Mongo are actually reachable. `npm run test:e2e` now handles the whole lifecycle itself (see `scripts/run-e2e.mjs`) — starts the disposable test Mongo, waits for it to be ready, runs the suite, and stops the container again afterward.

## Critical: containerization will not work as-is

You said the goal is to containerize this. Two things will break a Docker build/run immediately:

Both are still unresolved (deferred at your call — we tackled the security findings below first):

1. **`next build` requires a live MongoDB connection.** `dashboard.tsx` is an async Server Component with no `export const dynamic = "force-dynamic"`, so Next tries to statically prerender `/` *at build time*, which calls `getDashboardSummary()` and needs a working DB connection. I confirmed this: building against an unreachable Mongo fails the build outright with `MongooseServerSelectionError`. Most Docker workflows build the image without the runtime database available (DB only exists at container *run* time) — this app can't do that today. Fix is straightforward (mark the page dynamic, or fetch the summary client-side), but it's an architectural change so I didn't make it.

2. **`open-file` and `open-folder` are Windows-only and will not run in a Linux container at all.** Both routes shell out to Windows-specific commands (`cmd.exe /c start` and `explorer.exe`). Inside a Linux container these commands don't exist — the calls will fail every time. (The command-injection issue that used to also live here is now fixed — see below — but the Windows-only dependency itself remains.) This isn't a bug so much as a design assumption (server and desktop are the same Windows machine) that doesn't survive containerization. This needs a real design decision (e.g., drop the feature in containerized mode, return the path for the client to handle, or document it as host-only) — I didn't want to guess at the direction, so I've left it as-is and just documented the failure mode.

3. (Minor, but related) `next/font/google` (Geist/Geist Mono in `layout.tsx`) fetches fonts from Google at build time. If you ever build the image in a network-restricted CI runner or offline, this will also fail. Self-hosting the fonts or swapping to `next/font/local` avoids the dependency.

## Fixed during this engagement

- **Command injection in `open-file` and `open-folder` — FIXED.** Both used to build a shell command by directly string-interpolating unsanitized input: `` exec(`start "" "${filePath}"`) `` and `` exec(`explorer "${folderPath}"`) ``. A payload like `C:\legit.docx" & calc.exe & "` was executed verbatim. Both routes now use `execFile()` with an argument array instead of `exec()` with a template string — `execFile` never invokes a shell, so the untrusted value is passed as one literal argv element and can't break out into additional commands, regardless of what characters it contains. Regression test in `tests/api/open-file-open-folder.test.ts` (asserts the malicious payload is inert).

- **Path traversal in folder creation — FIXED.** `company` and `jobId` used to be validated only for non-emptiness, then joined directly into a filesystem path. A `jobId` of `../../something` could escape `applicationsRoot` entirely. Fixed at two layers: `jobApplicationInputSchema` now rejects any `company`/`jobId` containing `/`, `\`, or `..`; and `createApplicationFolder` independently verifies the resolved path stays inside `applicationsRoot` before doing anything, as defense in depth for any future caller that doesn't go through that same validation (e.g. `scripts/importCsv.js`, which still bypasses this validation entirely since it writes to Mongo directly — worth keeping in mind if you ever re-run it against untrusted CSV data). Regression tests in `tests/unit/validation.test.ts` and `tests/unit/createApplicationFolder.test.ts`.

## Other security notes

- **Real MongoDB password in `.env.local`.** Not a code bug, but since you're planning to open-source this: `.gitignore` already excludes `.env*`, so nothing has leaked. Before you `git init`/push anywhere, just double-check `.env.local` never gets force-added, and ship a `.env.example` with placeholder values for other users.

## Fixed: small bugs found during testing

- **Excel row column order mismatch — FIXED.** `src/lib/prompts/generateOutputs.ts` (the live app) produces `[date, company, jobId, jobUrl, jobTitle]`, matching the real spreadsheet header (`...Company, Job ID, Link, Title...`). `scripts/importCsv.js`'s `generateExcelRowText` was producing `[date, company, jobId, jobTitle, jobUrl]` — Title/URL swapped — and has been corrected to match.

- **Creating a resume silently regressed application status — FIXED.** `create-document/route.ts` used to unconditionally set `status: "Tailoring"` whenever a resume file was created. Now it only does that when the application is still `"UNSET"` (i.e. brand new), so (re)creating a resume for an application that already progressed further (e.g. `"2nd Round Scheduled"`) no longer regresses its status.

- **Duplicate-application race now handled cleanly — FIXED.** `POST /api/job-applications` still checks for an existing `{company, jobId}` via `findOne` before calling `create()` (a check-then-act race), but a genuine unique-index violation from `create()` is now caught and returns the same clean 409 ("That application already exists.") instead of a raw 500 with a Mongo error message.

- **`needsCustomResume` / `companyNeedsCustomResume` — REMOVED.** This was a remnant from an earlier workflow (auto-generating resume/cover letter based on whether a company needed a custom one) that the live app no longer uses anywhere. Removed the model field and its usage in `scripts/importCsv.js`. `src/lib/files/companyRules.ts` and `tests/unit/companyRules.test.ts` are now fully orphaned (nothing imports them, but they still work together fine) — delete both manually, since I can't delete files myself.

- **No delete/archive functionality anywhere** — API or UI. Might be intentional (append-only history), so left as-is; flagging in case it wasn't a deliberate choice.

## Dependency / build hygiene

- `next@16.2.1` has several published high/moderate-severity advisories (DoS, cache poisoning, middleware bypass) fixed in `16.2.10`, which is a same-minor patch bump — `npm audit` confirms `npm audit fix` alone won't reach it, but manually bumping to `16.2.10`+ should be a safe, low-risk update before you publish this.
- `eslint` currently fails on `scripts/importCsv.js` and `scripts/backfillEndedAt.js` (10 errors: `require()` imports forbidden by your `@typescript-eslint` config) and warns on an unused import in `src/lib/dashboard.ts`. Not urgent, but worth cleaning up before a public repo — a fresh contributor running `npm run lint` will hit red immediately.
- `tsc --noEmit` is fully clean — no type errors anywhere in the app.

## Test suite added to the repo

- `npm test` — 63 unit + API tests (Vitest), no external services needed, run in ~1.5s. Covers `status.ts`, `jobApplicationInputSchema`/`jobApplicationStatusSchema`, `generateOutputs`, `companyNeedsCustomResume`, `createApplicationFolder`, and all 7 API routes (validation, status codes, error paths, the fixes and remaining bugs above).
- `npm run test:e2e` — 8 Playwright browser tests covering create/edit/status-change flow, duplicate rejection, freeform search, typeahead behavior (including that non-matching free text is still accepted, per your UX convention), a dense-list check (defaults to 60 seeded applications, set `SEED_COUNT=300` to match your real target), and that copy actions give local button feedback rather than a global toast. Confirmed passing end-to-end against the real app. Fully self-contained now: `scripts/run-e2e.mjs` starts the disposable test Mongo, waits for it to actually accept connections, runs Playwright, and stops the container again afterward (pass, fail, or Ctrl+C) — no manual `docker compose` step needed.
- `docker-compose.test.yml` — disposable MongoDB on port 27117, isolated from your real homelab instance, for local test runs only.
