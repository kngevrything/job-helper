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

See `TESTING_REPORT.md` for the results of a full test/security pass over the app, including known limitations.

## Environment variables

See `.env.example` for the full list with descriptions. Summary:

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB connection string |
| `HOST_APPLICATIONS_DIR` | (Docker only) host path bind-mounted into the container as the applications folder |
| `APPLICATIONS_ROOT` | (non-Docker only) local path used directly as the applications folder |
| `BASE_RESUME_FILENAME` | Filename of your base resume template, expected inside the applications folder |
| `BASE_COVER_LETTER_FILENAME` | Filename of your base cover letter template, expected inside the applications folder |
