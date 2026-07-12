# Job Tracker — Testing Report

Date: 2026-07-11 (updated after follow-up fixes and a confirmed passing e2e run)

## How this was done

Static analysis (lint, `tsc --noEmit`, `next build`) ran directly against the repo. For everything else, I worked in an isolated copy of the repo in a sandbox, not your real working copy — see "Sandbox limitations" below for why.

I added a permanent automated test suite to the repo (66 unit/integration tests + 8 Playwright e2e tests). All 66 unit/integration tests pass. All 8 e2e tests have since been run and confirmed passing against the real app (see "Fixed during this engagement" below) — the sandbox limitation below only describes what I could run myself. (Note: the e2e suite doesn't exercise the resume/cover-letter/folder buttons at all, so it wouldn't have caught the open-file/open-folder containerization attempt being wrong for your workflow — that was only caught by your own review.)

### Sandbox limitations

My sandbox's network is allowlisted and blocks every source for downloading a MongoDB server binary (fastdl.mongodb.org, repo.mongodb.org, npm mirrors), and there's no Docker or root access. I could not run a real MongoDB myself, and your homelab Mongo isn't reachable from here (private IP). So:

- Unit tests for pure logic (validation, status rules, file/folder creation, output generation) run against the real code, no mocking.
- API route tests run the real route handlers with a small hand-written in-memory stand-in for the Mongoose model (`tests/mocks/fakeJobApplication.ts`), not real MongoDB. It correctly emulates the unique-index behavior your app depends on, but it isn't MongoDB — genuine driver/network edge cases aren't covered.
- True end-to-end UI tests (Playwright, `tests/e2e/`) needed to be run on your machine, where Docker/Mongo are actually reachable. `npm run test:e2e` now handles the whole lifecycle itself (see `scripts/run-e2e.mjs`) — starts the disposable test Mongo, waits for it to be ready, runs the suite, and stops the container again afterward.

## Containerization

The app now has a working Docker setup: `Dockerfile` (multi-stage, standalone Next.js output), `docker-compose.yml` (app + bundled MongoDB with a persistent volume), `.env.example`, and README instructions. The two things that would have broken a Docker build/run outright have both been fixed:

1. **`next build` requiring a live MongoDB connection — FIXED.** `dashboard.tsx` renders via `src/app/page.tsx`, an async Server Component with no `export const dynamic = "force-dynamic"`, so Next tried to statically prerender `/` *at build time*, which calls `getDashboardSummary()` and needs a working DB connection. Confirmed by building against an unreachable Mongo: it failed outright with `MongooseServerSelectionError`. Fixed by adding `export const dynamic = "force-dynamic"` to `src/app/page.tsx` — there was nothing to gain from static generation here anyway, since the page needs a live DB on every real request regardless. Reverified: `next build` now succeeds with zero DB connectivity (confirmed in my sandbox, which has none at all), and `/` shows as `ƒ` (dynamic) instead of attempting prerender.

2. **`open-file`/`open-folder` being Windows-only — deliberately NOT fixed; stays a known desktop-only limitation.** Both shell out to Windows-specific commands (`cmd.exe /c start`, `explorer.exe`) on the server's own machine, which only works when the server and the desktop opening the file are literally the same computer — broken by design inside a Linux container. A portable redesign was built and tried: `GET /api/job-applications/[id]/file?type=resume|coverLetter` served the file over HTTP for download, and folder-opening became a client-side "Copy Folder Path" button. **This was reverted at your request.** The reason: browser downloads always create a *second copy* of the file in the Downloads folder — editing that copy in Word and saving no longer writes back to the tracked application folder, which broke the actual "tailor the resume in place" workflow this app exists for. Shell-exec is the only way to preserve that workflow, and preserving it took priority over container portability for this one feature. Net effect: this app's core CRUD/tracking functionality is fully containerizable (see above), but the open-file/open-folder buttons specifically will not work inside a container — they need the server running on the same Windows machine as the browser. The reverted HTTP-download route is left in the codebase as an inert 410 stub (`src/app/api/job-applications/[id]/file/route.ts`) for reference/future revisit; delete it manually if you don't want it around. Tests in `tests/api/open-file-open-folder.test.ts` (and a pointer stub in `tests/api/file-download.test.ts`) cover the current (reverted) behavior.

3. (Minor, still open) `next/font/google` (Geist/Geist Mono in `layout.tsx`) fetches fonts from Google at build time. If you ever build the image in a network-restricted CI runner or offline, this will fail. Self-hosting the fonts or swapping to `next/font/local` avoids the dependency. Not addressed — flagging for whenever it matters to you.

I haven't tested `docker compose up -d --build` myself (no Docker in my sandbox) — see the Docker section of the README.

## Fixed during this engagement

- **Command injection in `open-file` and `open-folder` — FIXED.** Both used to build a shell command by directly string-interpolating unsanitized input: `` exec(`start "" "${filePath}"`) `` and `` exec(`explorer "${folderPath}"`) ``. A payload like `C:\legit.docx" & calc.exe & "` was executed verbatim. Both routes now use `execFile()` with an argument array instead of `exec()` with a template string — `execFile` never invokes a shell, so the untrusted value is passed as one literal argv element and can't break out into additional commands, regardless of what characters it contains. This fix is still in place after the containerization redesign attempt for these routes was reverted (see "Containerization" above) — reverting brought back the shell-exec *approach*, not the original unfixed *code*. Regression test in `tests/api/open-file-open-folder.test.ts`.

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

- `npm test` — 66 unit + API tests (Vitest), no external services needed, run in ~2s. Covers `status.ts`, `jobApplicationInputSchema`/`jobApplicationStatusSchema`, `generateOutputs`, `companyNeedsCustomResume`, `createApplicationFolder`, and all API routes (validation, status codes, error paths, the fixes and remaining bugs above).
- `npm run test:e2e` — 8 Playwright browser tests covering create/edit/status-change flow, duplicate rejection, freeform search, typeahead behavior (including that non-matching free text is still accepted, per your UX convention), a dense-list check (defaults to 60 seeded applications, set `SEED_COUNT=300` to match your real target), and that copy actions give local button feedback rather than a global toast. Confirmed passing end-to-end against the real app. Fully self-contained now: `scripts/run-e2e.mjs` starts the disposable test Mongo, waits for it to actually accept connections, runs Playwright, and stops the container again afterward (pass, fail, or Ctrl+C) — no manual `docker compose` step needed.
- `docker-compose.test.yml` — disposable MongoDB on port 27117, isolated from your real homelab instance, for local test runs only.
