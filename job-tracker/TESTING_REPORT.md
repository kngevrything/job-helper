# Job Tracker — Testing Report

Date: 2026-07-11

## How this was done

Static analysis (lint, `tsc --noEmit`, `next build`) ran directly against the repo. For everything else, I worked in an isolated copy of the repo in a sandbox, not your real working copy — see "Sandbox limitations" below for why, and note at the bottom about `node_modules` in your real repo.

I added a permanent automated test suite to the repo (62 unit/integration tests + 8 Playwright e2e tests). All 62 unit/integration tests pass, and they encode the bugs and security issues found below as failing-would-be-expected assertions (i.e. the tests currently pass because they document *current* behavior, including the bad behavior — read the "BUG"/"SECURITY"/"PORTABILITY"-prefixed test names for a runnable specification of every finding).

### Sandbox limitations (read this first)

My sandbox's network is allowlisted and blocks every source for downloading a MongoDB server binary (fastdl.mongodb.org, repo.mongodb.org, npm mirrors), and there's no Docker or root access. I could not run a real MongoDB, and your homelab Mongo isn't reachable from here (private IP). So:

- Unit tests for pure logic (validation, status rules, file/folder creation, output generation) run against the real code, no mocking.
- API route tests run the real route handlers with a small hand-written in-memory stand-in for the Mongoose model (`tests/mocks/fakeJobApplication.ts`), not real MongoDB. It correctly emulates the unique-index behavior your app depends on, but it isn't MongoDB — genuine driver/network edge cases aren't covered.
- True end-to-end UI tests (Playwright, `tests/e2e/`) are written and verified to type-check and load correctly, but I could not execute them here since they need a live server backed by real Mongo. Run them yourself with `docker compose -f docker-compose.test.yml up -d` (spins up disposable MongoDB), then `npm run test:e2e`.

## Critical: containerization will not work as-is

You said the goal is to containerize this. Two things will break a Docker build/run immediately:

1. **`next build` requires a live MongoDB connection.** `dashboard.tsx` is an async Server Component with no `export const dynamic = "force-dynamic"`, so Next tries to statically prerender `/` *at build time*, which calls `getDashboardSummary()` and needs a working DB connection. I confirmed this: building against an unreachable Mongo fails the build outright with `MongooseServerSelectionError`. Most Docker workflows build the image without the runtime database available (DB only exists at container *run* time) — this app can't do that today. Fix is straightforward (mark the page dynamic, or fetch the summary client-side), but it's an architectural change so I didn't make it.

2. **`open-file` and `open-folder` are Windows-only and will not run in a Linux container at all.** Both routes shell out via `child_process.exec()` to Windows-specific commands (`start "" "<path>"` and `explorer "<path>"`). Inside a Linux container these commands don't exist — the calls will fail every time. This isn't a bug so much as a design assumption (server and desktop are the same Windows machine) that doesn't survive containerization. This needs a real design decision (e.g., drop the feature in containerized mode, return the path for the client to handle, or document it as host-only) — I didn't want to guess at the direction, so I've left it as-is and just documented the failure mode.

3. (Minor, but related) `next/font/google` (Geist/Geist Mono in `layout.tsx`) fetches fonts from Google at build time. If you ever build the image in a network-restricted CI runner or offline, this will also fail. Self-hosting the fonts or swapping to `next/font/local` avoids the dependency.

## Security findings

- **Command injection in `open-file` and `open-folder`.** Both build a shell command by directly string-interpolating unsanitized input: `` exec(`start "" "${filePath}"`) `` and `` exec(`explorer "${folderPath}"`) ``. `filePath` comes straight from the POST body with no validation. A payload like `C:\legit.docx" & calc.exe & "` is executed verbatim. Right now this is same-machine-only so the practical blast radius is limited, but if this app is ever exposed beyond localhost (which containerizing/making it available as an open-source project makes more likely for other users), this is a real remote-code-execution path. Proven with a test in `tests/api/open-file-open-folder.test.ts` that asserts the exact injected command string.

- **Path traversal in folder creation.** `company` and `jobId` are validated only for non-emptiness (`z.string().trim().min(1)`), then joined directly into a filesystem path (`path.join(applicationsRoot, company, jobId)`). A `jobId` of `../../something` escapes `applicationsRoot` entirely. Proven in `tests/unit/createApplicationFolder.test.ts`. Low risk for you personally (single trusted user), but worth sanitizing before this is something strangers run.

- **Real MongoDB password in `.env.local`.** Not a code bug, but since you're planning to open-source this: `.gitignore` already excludes `.env*` and I confirmed the folder isn't a git repo yet, so nothing has leaked. Before you `git init`, just double-check `.env.local` never gets force-added, and ship a `.env.example` with placeholder values for other users.

## Functional bugs / inconsistencies

- **Excel row column order mismatch.** `src/lib/prompts/generateOutputs.ts` produces `[date, company, jobId, jobUrl, jobTitle]`, but `scripts/importCsv.js`'s `generateExcelRowText` produces `[date, company, jobId, jobTitle, jobUrl]` — URL and title are swapped between the live app and the import script. If you ever compare/merge rows from both sources, they won't line up. Proven in `tests/unit/generateOutputs.test.ts`.

- **Creating a resume silently regresses application status.** `create-document/route.ts` unconditionally sets `status: "Tailoring"` whenever a resume file is created, with no check on the current status. If an application has already progressed (e.g. `"2nd Round Scheduled"`) and a resume gets (re)created for any reason, its status silently jumps backward to "Tailoring". Cover letter creation, by contrast, doesn't touch status at all — the two are inconsistent with each other. Proven in `tests/api/create-document.test.ts`.

- **Duplicate-application race isn't handled cleanly.** `POST /api/job-applications` checks for an existing `{company, jobId}` via `findOne` before calling `create()`. That's a check-then-act race: if two requests land close together, the second can pass the `findOne` check and then hit the real unique-index violation inside `create()`, which isn't caught — it surfaces as a generic 500 with a raw `E11000 duplicate key` message instead of the clean 409 the UI expects (which shows "That application already exists."). Low real-world likelihood for a single-user local app, but easy to fix with a try/catch around `create()`. Proven in `tests/api/job-applications.test.ts`.

- **`needsCustomResume` / `companyNeedsCustomResume` is dead code in the live app.** The model has a `needsCustomResume` field and `src/lib/files/companyRules.ts` has logic to compute it, but no API route or UI component ever calls `companyNeedsCustomResume()` — only the legacy `scripts/importCsv.js` uses it. Every application created through the app has `needsCustomResume: null` forever. Either wire it in or remove it; right now it's a feature that looks implemented but isn't.

- **No delete/archive functionality anywhere** — API or UI. Might be intentional (append-only history), but flagging since it wasn't obvious either way.

## Dependency / build hygiene

- `next@16.2.1` has several published high/moderate-severity advisories (DoS, cache poisoning, middleware bypass) fixed in `16.2.10`, which is a same-minor patch bump — `npm audit` confirms `npm audit fix` alone won't reach it, but manually bumping to `16.2.10`+ should be a safe, low-risk update before you publish this.
- `eslint` currently fails on `scripts/importCsv.js` and `scripts/backfillEndedAt.js` (10 errors: `require()` imports forbidden by your `@typescript-eslint` config) and warns on an unused import in `src/lib/dashboard.ts`. Not urgent, but worth cleaning up before a public repo — a fresh contributor running `npm run lint` will hit red immediately.
- `tsc --noEmit` is fully clean — no type errors anywhere in the app.

## Test suite added to the repo

- `npm test` — 62 unit + API tests (Vitest), no external services needed, run in ~1.5s. Covers `status.ts`, `jobApplicationInputSchema`/`jobApplicationStatusSchema`, `generateOutputs`, `companyNeedsCustomResume`, `createApplicationFolder`, and all 7 API routes (validation, status codes, error paths, the bugs above).
- `npm run test:e2e` — 8 Playwright browser tests covering create/edit/status-change flow, duplicate rejection, freeform search, typeahead behavior (including that non-matching free text is still accepted, per your UX convention), a dense-list check (defaults to 60 seeded applications, set `SEED_COUNT=300` to match your real target), and that copy actions give local button feedback rather than a global toast. **Requires a real Mongo** — run `npm run test:db:up` first (needs Docker), and set `APPLICATIONS_ROOT` to a scratch folder before running.
- One-time setup: `npm install` (adds `vitest`, `@playwright/test`, `vite-tsconfig-paths` as devDependencies — already added to `package.json`, nothing else changed) then `npx playwright install chromium` before the first e2e run.
- `docker-compose.test.yml` — disposable MongoDB on port 27117, isolated from your real homelab instance, for local test runs only.

## One thing to clean up on your end

Early in this session I ran an npm install directly in your real `job-tracker` folder to test a build, which modified `node_modules` (added Linux binaries, hit permission errors removing some Windows ones). Nothing in your source code, `package.json`, or `package-lock.json` was touched — I verified that — but run `npm install` once on your Windows machine before your next `npm run dev` there to reconcile `node_modules` cleanly. All further work happened in an isolated sandbox copy.
