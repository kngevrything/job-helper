# Job Tracker

A local-only job application tracker: create an entry per application, generate a per-application folder with copies of your resume/cover letter to tailor, and track status through the interview process. Built with Next.js, MongoDB/Mongoose, and Tailwind.

## Running with Docker (recommended)

Requires Docker and Docker Compose.

1. Copy the env template and fill in your values:

   ```bash
   cp .env.example .env
   ```

   At minimum, set `HOST_APPLICATIONS_DIR` to a real folder on your machine where application folders should be created, and make sure `BASE_RESUME_FILENAME`/`BASE_COVER_LETTER_FILENAME` match template files that already exist directly inside that folder.

2. Start it:

   ```bash
   docker compose up -d --build
   ```

   This starts the app on [http://localhost:3000](http://localhost:3000) plus a bundled MongoDB instance. If you'd rather use your own MongoDB, set `MONGODB_URI` in `.env` instead and ignore/remove the `mongo` service in `docker-compose.yml`.

3. Stop it with `docker compose down` (add `-v` to also wipe the bundled Mongo's data volume).

Note: the "Resume"/"Cover Letter"/"Open Folder" buttons in the UI don't work when running via Docker. See [Known Limitations](#known-limitations).

## Running without Docker

Requires Node.js >=20.9 and a reachable MongoDB instance.

```bash
npm install
cp .env.example .env.local   # then edit: set MONGODB_URI, APPLICATIONS_ROOT (a real
                              # local path, not HOST_APPLICATIONS_DIR), and the base
                              # resume/cover letter filenames
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Testing

```bash
npm test          # unit + API tests (Vitest), no external services needed
npm run test:e2e  # Playwright end-to-end tests; starts/stops a disposable test Mongo automatically
```

`npm test` runs 60 unit and API tests covering validation, status rules, output generation, folder/file creation, and all API routes. `npm run test:e2e` runs 8 Playwright browser tests covering the create/edit/status-change flow, duplicate rejection, search, and typeahead behavior; it manages its own disposable MongoDB container via `scripts/run-e2e.mjs`.

## Environment variables

See `.env.example` for the full list with descriptions. Summary:

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB connection string |
| `HOST_APPLICATIONS_DIR` | (Docker only) host path bind-mounted into the container as the applications folder |
| `APPLICATIONS_ROOT` | (non-Docker only) local path used directly as the applications folder |
| `BASE_RESUME_FILENAME` | Filename of your base resume template, expected inside the applications folder |
| `BASE_COVER_LETTER_FILENAME` | Filename of your base cover letter template, expected inside the applications folder |

## Known Limitations

- **Opening files/folders only works when running natively, not in Docker.** The "Resume", "Cover Letter", and "Open Folder" buttons shell out to Windows commands (`cmd.exe`, `explorer.exe`) on the server's own machine, so edits made in Word save back directly to the tracked application folder. This requires the server and browser to be on the same Windows machine, and does not work in any Docker deployment of this app — including Docker Desktop running locally, since containers run as Linux internally regardless of the host OS. Run the app natively (`npm run dev` / `npm start`) if these buttons need to work.
- **`next build` requires network access** to fetch the Geist/Geist Mono fonts from Google (`next/font/google` in `src/app/layout.tsx`). Builds in offline or network-restricted environments will fail unless the fonts are self-hosted or swapped to `next/font/local`.
- **No delete/archive functionality.** Application records are append-only; there's currently no way to remove or archive an entry from the API or UI.
- **`scripts/importCsv.js` bypasses folder-path validation.** Unlike the API routes, the CSV import script writes directly to MongoDB and does not validate `company`/`jobId` against path traversal. Only run it against trusted CSV data.

## Security notes

- `company`/`jobId` input is validated against path traversal (rejects `..`, `/`, `\`) both at the API layer and again in `createApplicationFolder`, as defense in depth.
- File/folder opening uses `execFile()` with argument arrays rather than a shell-interpreted string, so file paths can't be used for command injection.
- `.gitignore` excludes all `.env*` files except `.env.example`; double-check `.env.local`/`.env` are never force-added before pushing.

## Known issues

- `next@16.2.1` has published security advisories (DoS, cache poisoning, middleware bypass) fixed in `16.2.10+` — a safe, low-risk same-minor upgrade.
- `npm run lint` currently fails on `scripts/importCsv.js` and `scripts/backfillEndedAt.js` (`require()` imports) and warns on an unused import in `src/lib/dashboard.ts`.
