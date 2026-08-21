# Job Helper

A personal job search toolkit: a local-only job application tracker (web app) plus a companion Chrome extension that captures applications straight from Greenhouse, LinkedIn, Workday, and Lever job postings so you don't have to switch tabs and retype company/title/URL by hand.

Two pieces live in this repo, and you need both — the extension is a bridge that writes into the tracker app, it isn't standalone:

- **[`job-tracker/`](./job-tracker)** — the Next.js/Mongo web app. This is the actual database and UI; set it up and get it running first. Full install instructions (native or Docker), environment variables, testing, and known limitations are in its own [README](./job-tracker/README.md).
- **[`chrome-extension/`](./chrome-extension)** — a Manifest V3 Chrome extension (side panel, not a popup) that scrapes job postings and submits them to your running `job-tracker` instance. Install instructions, including how to point it at `job-tracker`, are in its own [README](./chrome-extension/README.md). It's under active development — see that README's "what's deliberately not built yet" section for the current gaps — but capture works end-to-end for the four supported sites.

## Quick start

1. Set up and start `job-tracker` first — see [`job-tracker/README.md`](./job-tracker/README.md). Note the URL it ends up reachable at (e.g. `http://localhost:3000`, or wherever you're hosting it); the extension needs that.
2. Load `chrome-extension/` as an unpacked extension and point it at that URL — see [`chrome-extension/README.md`](./chrome-extension/README.md) for the exact steps.

## License

MIT — see [`job-tracker/LICENSE`](./job-tracker/LICENSE).
