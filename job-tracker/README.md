# Job Tracker

A local-only job application tracker for managing your job search. Create an entry per application, track status through the full interview pipeline, and (on Windows) automatically generate a per-application folder with copies of your resume and cover letter ready to tailor.

## Modes of use

**Full mode — native on Windows (recommended)**
Tracking + per-application folder creation + file/folder opening directly from the UI. Requires Node.js running natively on the same Windows machine you use for job applications.

**Tracking-only mode — Docker or non-Windows**
Status tracking, notes, and pipeline management. Folder creation and file-opening buttons are not available since the server cannot access your local filesystem in these environments.

## Option A: Native on Windows (full experience)

Requires Node.js >=20.9 and a reachable MongoDB instance. No MongoDB database or collection setup is needed — the app creates them automatically on first use.

If you don't have MongoDB installed, [MongoDB Community Server](https://www.mongodb.com/try/download/community) is free and straightforward to set up locally. Once running, your connection string will be `mongodb://localhost:27017`.

1. Clone the repo and install dependencies:

   ```bash
   git clone https://github.com/kngevrything/job-helper.git
   cd job-tracker
   npm install
   ```

2. Copy the env template and fill in your values:

   ```bash
   cp .env.example .env.local
   ```

   See [Environment variables](#environment-variables) for what each value means.

3. Copy the starter prompt config and customize it for your workflow (or leave the default):

   ```bash
   cp src/lib/prompts/userConfig.example.ts src/lib/prompts/userConfig.local.ts
   ```

   `userConfig.local.ts` is gitignored and will not be committed.

4. Start the dev server:

   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000).

## Option B: Docker (tracking only)

Requires Docker and Docker Compose. No MongoDB setup needed if you use the bundled instance — it starts automatically.

1. Clone the repo:

   ```bash
   git clone https://github.com/kngevrything/job-helper.git
   cd job-tracker
   ```

2. Copy the starter prompt config before building (it is baked into the image at build time):

   ```bash
   cp src/lib/prompts/userConfig.example.ts src/lib/prompts/userConfig.local.ts
   ```

3. Copy the env template and fill in your values:

   ```bash
   cp .env.example .env
   ```

   The bundled MongoDB instance starts automatically — you do not need to set `MONGODB_URI` unless you want to use your own. See [Environment variables](#environment-variables) for details.

4. Build and start:

   ```bash
   docker compose up -d --build
   ```

5. Open [http://localhost:3000](http://localhost:3000).

To stop: `docker compose down` (add `-v` to also wipe the bundled Mongo's data volume).

## Customizing outputs

When you create an application, the app generates two text outputs alongside the record:

**Starter prompt:** A prompt you can paste into an AI chat to kick off a resume tailoring session for that role. Customize it by editing `src/lib/prompts/userConfig.local.ts`. The template receives `company` and `jobTitle` as arguments. See `userConfig.example.ts` for the shape.

**Excel row (legacy):** A tab-separated row for pasting into a tracking spreadsheet. Columns in order: `Date`, `Company`, `Job ID`, `Job URL`, `Job Title`. If you don't use a spreadsheet, ignore this field.

## Testing

```bash
npm test          # unit + API tests (Vitest), no external services needed
npm run test:e2e  # Playwright end-to-end tests; starts/stops a disposable test Mongo automatically
```

`npm test` runs unit and API tests covering validation, status rules, output generation, folder/file creation, and all API routes. `npm run test:e2e` runs Playwright browser tests covering the create/edit/status-change flow, duplicate rejection, search, and typeahead behavior; it manages its own disposable MongoDB container via `scripts/run-e2e.mjs`.

## Environment variables

See `.env.example` for the full list with descriptions. Summary:

| Variable                     | Purpose                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| `MONGODB_URI`                | MongoDB connection string. Defaults to the bundled instance when using Docker.        |
| `HOST_APPLICATIONS_DIR`      | (Docker only) Host path bind-mounted into the container as the applications folder.   |
| `APPLICATIONS_ROOT`          | (Native only) Local path used directly as the applications folder.                    |
| `BASE_RESUME_FILENAME`       | Filename of your base resume template, expected inside the applications folder.       |
| `BASE_COVER_LETTER_FILENAME` | Filename of your base cover letter template, expected inside the applications folder. |
| `APPLICANT_NAME`             | Your name, used in generated filenames (e.g. `Jane Smith Resume 12345.docx`).         |

## Known limitations

- **File/folder buttons only work natively on Windows.** The "Resume", "Cover Letter", and "Open Folder" buttons shell out to Windows commands on the server's machine. This requires the app to be running natively on the same Windows machine you use for job applications. Docker and non-Windows environments do not support this.
- **`next build` requires network access** to fetch the Geist/Geist Mono fonts from Google (`next/font/google` in `src/app/layout.tsx`). Builds in offline or network-restricted environments will fail unless the fonts are self-hosted or swapped to `next/font/local`.
- **No delete/archive functionality.** Application records are append-only; there is currently no way to remove or archive an entry from the API or UI.
- **`scripts/importCsv.js` bypasses folder-path validation.** Unlike the API routes, the CSV import script writes directly to MongoDB and does not validate `company`/`jobId` against path traversal. Only run it against trusted CSV data.

## Security notes

- `company`/`jobId` input is validated against path traversal (rejects `..`, `/`, `\`) both at the API layer and again in `createApplicationFolder`, as defense in depth.
- File/folder opening uses `execFile()` with argument arrays rather than a shell-interpreted string, so file paths cannot be used for command injection.
- `.gitignore` excludes all `.env*` files except `.env.example`; double-check `.env.local`/`.env` are never force-added before pushing.

## Known issues

- `next@16.2.1` has published security advisories (DoS, cache poisoning, middleware bypass) fixed in `16.2.10+` — a safe, low-risk same-minor upgrade.
- `npm run lint` currently fails on `scripts/importCsv.js` and `scripts/backfillEndedAt.js` (`require()` imports).

## License

MIT — see [LICENSE](./LICENSE).
