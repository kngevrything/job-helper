# Design notes

Implementation rationale, scraper internals, and known rough edges for
anyone building on top of this extension. None of this is needed to
install or use it, see [`README.md`](../README.md) for that.

## Why the side panel instead of a popup or a standalone window

Chrome's default anchored extension window closes the instant it loses
focus, a hard platform behavior. A detached `chrome.windows.create`
window fixes that, but introduces a different problem: it's just
another window, easy to lose behind your job-search tabs and
everything else open.

The side panel solves both: it's docked to the browser window itself
(`manifest.json`'s `side_panel.default_path`, enabled on icon-click
via `chrome.sidePanel.setPanelBehavior` in `background.js`), so it
can't get buried behind other windows, and it stays open across tab
switches within that window rather than closing on blur. On top of
that, form values still autosave to a draft in `chrome.storage.local`
(cleared once a save actually succeeds), so even closing the panel
outright doesn't lose an in-progress capture. A **Clear** button next
to Rescan wipes the draft and starts fresh.

**Permission note:** `sidePanel` and `tabs` are both required. `tabs`
so the panel can read whatever tab you're currently looking at as you
switch around while it stays open (plain `activeTab` only covers the
tab active at the moment you first clicked the icon). `tabs` is
broader: it lets the extension read the URL/title of any open tab, not
just that one.

**Auto-rescan:** the panel rescans automatically on tab switch, on tab
navigation completing, and on browser window focus change. If the
newly active tab's content script isn't reachable (most commonly: that
tab was already open before the extension was loaded/reloaded, so
Chrome never auto-injected it), the panel injects it on demand via
`chrome.scripting.executeScript` and retries once, instead of asking
you to reload the tab yourself.

**Known trade-off:** auto-rescan overwrites whatever's currently in
the form the moment it detects a switch to a recognized job site, so
if you're mid-edit and briefly alt-tab away and back, expect your
typed values to get replaced by a fresh scrape rather than preserved.
The 300ms draft autosave should have already captured your edits
before you switched, so nothing's unrecoverable, but the visible
fields will change without a prompt. The tab/window listeners also
aren't scoped to just this panel's own window: switching tabs in an
unrelated browser window triggers a redundant (harmless, just wasted)
rescan too, since there's no cheap way to filter that from a side
panel context.

## Why "Connect" instead of it just working

Your API's origin isn't fixed (localhost in dev, a homelab hostname
otherwise), so it can't be hardcoded into `manifest.json`'s
`host_permissions` at build time. Instead, `manifest.json` declares
`localhost` and `<all_urls>` as **optional** host permissions, and the
panel requests permission for the _exact_ origin you type in, via
`chrome.permissions.request`. Chrome will show a one-time approval
prompt the first time; after that it's granted until you revoke it in
`chrome://extensions`.

If you'd rather skip that runtime-prompt UX for your own homelab
hostname, you can instead hardcode it directly into
`host_permissions` in `manifest.json` (e.g.
`"http://homelab.local:3000/*"`) and drop the Connect step, that's a
one-line change once you know the final hostname.

## Scraper implementation details

All four scrapers are also documented at the top of their own
`content-scripts/*.js` file; this is the same information gathered in
one place for a quicker read.

### Greenhouse

Prefers the page's JSON-LD `JobPosting` schema, falls back to DOM
selectors, then `document.title` parsing.

Confirmed live that `job-boards.greenhouse.io` (the newer React
layout, distinct from legacy `boards.greenhouse.io`) emits no JSON-LD
and doesn't match the legacy DOM company selectors. Its `h1` still
yields a job title via the generic DOM fallback, but company comes
back empty from all three main tiers. Two more sources kick in
specifically to backfill company when that happens:
`"Job Application for {Title} at {Company}"`, this layout's actual
`<title>` format (no dash/pipe separator, so it doesn't match the
dash-split parsing above), and, as a last resort, the company slug
already present in every Greenhouse job URL
(`{boards,job-boards}.greenhouse.io/{company}/jobs/{id}`), title-cased
as a guess with no claim its casing matches the real branding.

`jobId` is parsed from the URL path (`/jobs/<digits>`). If a board you
use has a different URL shape, that'll come back empty, worth checking
against a couple of real postings you've actually applied to. The
company-name DOM fallback guesses at a few common layouts that haven't
been verified against a live page. The `job-boards.greenhouse.io`
fallbacks above have only been confirmed against one posting
(SecurityScorecard); if that layout's title format varies by tenant,
or a tenant's slug doesn't resemble their real name at all, this will
still come back with a guess you need to double check, not an empty
field.

### LinkedIn

Same fallback order as Greenhouse, but the DOM selectors here are on
much shakier ground: LinkedIn's markup is unstable, differs between
logged-in and public views, and changes without notice. Treat
medium/low-confidence LinkedIn scrapes as a starting point to verify,
not a fact.

`jobId` is pulled from the URL path (`/jobs/view/<id>`, or a trailing
`-<id>` slug) or, when you're viewing a job from inside
search/collections results, from the `?currentJobId=` query param. The
saved `jobUrl` is normalized to the canonical `/jobs/view/<id>/` form
when an id was found, since search/collections URLs aren't stable
permalinks to the posting.

Confirmed live against a real posting reached through a
`/jobs/search-results/?currentJobId=...` page (a Yahoo listing) that
this page shape doesn't expose ANY of the DOM company/title selectors
above, nor JSON-LD, unlike the standalone `/jobs/view/` page. It falls
all the way through to the `document.title` parse, the least reliable
tier. That tier itself had a real bug on this posting's title
(`"Senior Software Engineer - Developer Experience & Tools | Yahoo |
LinkedIn"`): splitting on `-` and `|` interchangeably grabbed
"Developer Experience & Tools" (part of the job title, which contains
its own hyphen) as the company instead of "Yahoo". Fixed by preferring
a split on `|` first when one is present (a job title can contain a
hyphen but not a pipe) and only falling back to hyphen-splitting when
there's no pipe in the title at all. No selectors have been found yet
for the search-results page's actual company-name element, so a
posting reached that way still won't get above "low" confidence, it
just gets the *right* low-confidence answer now instead of a wrong one.

I'm fairly confident about the URL/id parsing, much less confident
about the class-name selectors, since LinkedIn's markup is obfuscated,
varies by auth state, and changes without notice. Worth testing
against a few real postings (both logged-in and, if you use it,
logged-out) before trusting it unattended.

### Workday

Tries Workday's own internal JSON API first
(`/wday/cxs/{tenant}/{site}/job/{externalPath}`, same-origin fetch
from the content script, the same endpoint the page's own React app
calls) for title/company, but `jobId` always comes from parsing the
URL slug directly, never from the API. Live-testing on a real Autodesk
posting showed the API's id-ish fields hold Workday's internal routing
identifier, which is just the full URL slug again, not the short
requisition number actually shown on the page, so that field is
ignored entirely. The URL-parsing extraction (e.g.
`Principal-Software-Engineer_26WD97962-1` -> `26WD97962`) has been
verified against three real tenants (Autodesk, SHI, and Yahoo). Company
name isn't in page metadata either way, so it's guessed from the tenant
subdomain (`autodesk` -> `Autodesk`) when the API doesn't supply one,
never treated as high-confidence.

`externalPath` (the slug used in the API call and in requisition-id
parsing) is taken from the last segment of the URL path, not a fixed
offset from the `job`/`details` anchor segment. Confirmed live on a
real Yahoo posting (`ouryahoo.wd5.myworkdayjobs.com`) that some tenants
insert an extra location segment between `job` and the real slug
(`/en-US/careers/job/United-States-of-America/Senior-...-Tools_JR0027211`),
which would have been misparsed as the externalPath if the code assumed
the slug always comes immediately after `job`/`details`. Taking the
last path segment instead works for both that shape and the simpler
Autodesk/SHI shape, where the slug was already the last segment.

The internal JSON API does respond (confirmed live on real Autodesk and
Yahoo postings), but not every field on it should be trusted, as above.
The URL-parsing extraction has held up across three real tenants
(Autodesk, SHI, Yahoo); title/company from the API weren't observed to
have the same problem, but that's based on a handful of tenants' live
behavior, not a guarantee across all Workday deployments.

### Lever

`company` and posting id come directly from the URL path
(`jobs.lever.co/{company}/{postingId}`): the posting id is an opaque
UUID used as-is, no parsing needed. For the human-readable company
name, prefers JSON-LD (if present, unverified) or `og:title`, Lever's
format is `"{Company} - {Job Title}"`, company **first**, the opposite
order from Greenhouse/LinkedIn, falling back to `document.title`, and
only guessing from the URL slug (never above medium-confidence) if
none of those produced a name.

Verified against one real Lever posting, same single-sample caveat as
the other non-Greenhouse scrapers. The JSON-LD tier specifically is
untested: I haven't confirmed a real Lever posting that actually emits
a `JobPosting` schema block, unlike Greenhouse/LinkedIn where that's
been observed directly. The `og:title` tier is the one that's actually
been verified live, and only against a single posting/tenant.

### Ashby

Ashby job board pages (`jobs.ashbyhq.com/{orgSlug}/{jobId}`) are fully
client-side rendered -- confirmed live, server-side, against a real
posting: the initial HTML has no JSON-LD, no `og:*` meta tags, and
`<title>` is a static `"Jobs"` placeholder until the SPA hydrates. So
instead of scraping rendered markup as the primary source the way
Greenhouse/Lever do, this calls Ashby's own public Job Board API --
`https://api.ashbyhq.com/posting-api/job-board/{orgSlug}`, the same
unauthenticated JSON endpoint Ashby documents for embedding a job
board on a company's own careers page. Confirmed live: a server-side
`GET .../posting-api/job-board/1password` returned
`{ jobs: [{ id, title, jobUrl, ... }] }` with no auth needed. `jobId`
from the URL is matched against each entry's `id` to find that
posting's `title`.

**Caveat -- weaker verification than the other four scrapers.** That
API call was made server-side, with no browser and no CORS
enforcement in the loop -- there was no working Chrome connection
available to drive an actual browser against `jobs.ashbyhq.com` when
this was written. Two things are consequently unverified, unlike
everything else in this section:

- Whether `api.ashbyhq.com` actually sends CORS headers permitting a
  `fetch()` from a `jobs.ashbyhq.com` content script. If it doesn't,
  `tryJobBoardApi()` fails closed (catches the error, returns `null`)
  and the scraper falls through to the DOM/title tiers below --
  degraded confidence, not a break.
- What `document.title` becomes once the SPA hydrates, and whether
  there's a stable DOM selector for the job title. The `h1` and
  `document.title` fallback tiers are generic guesses (the `h1` tier
  mirrors Greenhouse's own last-resort selector), not confirmed
  against a real rendered Ashby page.

The API response also has no company/organization name field at all
(confirmed against the same live response) -- only per-job fields --
so `company` always falls back to the same tiers as Greenhouse/Lever:
`document.title` parsing, then a title-cased guess off the URL's org
slug (e.g. won't recover "1Password" from "1password"), same
last-resort caveat as those two.

Test this against a couple of real postings once you can drive a
browser against it, and tighten or replace the unverified tiers based
on what you actually see.

## Company casing correction

Every scraper above ends up guessing company casing from a URL slug or
subdomain when the page/API itself doesn't supply a real name --
Ashby's API has no company field at all, so it's *always* a guess
there, but Greenhouse, Lever, and Workday fall back the same way
whenever their own better tiers come up empty. A slug like
`jobs.ashbyhq.com/1password/...` title-cases to `"1password"`, not
`"1Password"` -- there's no way to recover real branding from a URL
segment.

Left alone, that means the same company can end up saved under
multiple casings across records ("1password" vs "1Password"), which
reads as two different companies anywhere the comparison isn't
collation-aware (skimming the table, exporting to a spreadsheet,
`Ctrl+F`). Fixed with a small correction loop between the extension
and `job-tracker`, not by trying to make any scraper smarter about
casing -- there's no reliable source for real branding short of asking
you.

**`job-tracker`:** a new read-only endpoint,
`GET /api/job-applications/company-casing?company=<guess>`
(`src/app/api/job-applications/company-casing/route.ts`), does a
case-insensitive lookup via the same `DUPLICATE_MATCH_COLLATION` the
duplicate-check endpoint and the unique index itself use, and returns
the casing from your most recently created matching application, or
`null` if you've never applied there.

**Extension (`panel.js`):** calls that lookup two ways --

- After every scrape (all four sites), using that scraper's own
  overall `confidence` value. There's no separate per-field confidence
  for company -- every scraper already downgrades `confidence` to
  medium/low specifically when company came from a slug/subdomain
  guess (see each scraper's section above), so "not high" is already a
  reliable stand-in for "company is probably a guess."
- On manual typing/blur in the Company field (debounced 600ms, same
  shape as `scheduleDuplicateCheck`), always passed `confidence:
  'high'` -- a hand-typed value is deliberate the same way a
  high-confidence scrape is.

Behavior splits on that confidence: a guessed (not-high-confidence)
value gets silently rewritten to match your saved casing, no notice,
nothing to dismiss. A high-confidence value (real page/API data, or
something you typed yourself) that still disagrees with your history
is never auto-overwritten -- instead `#casingConflictNotice` shows a
one-click chip with the saved casing (`showCasingSuggestion()` /
`hideCasingConflict()`), so you decide, since a real disagreement
could mean the company's branding actually changed or an old record
was entered inconsistently, not that this scrape is wrong.

**Deliberately not applied to `job-tracker`'s own Add-application
form.** That form's `TypeaheadInput` for company is intentionally
free-form (see `job-tracker`'s CLAUDE.md) -- the same company name can
legitimately belong to different real entities there (e.g. a staffing
vendor posting under a client's name), so nudging toward one "correct"
casing would be actively wrong sometimes. The extension's version is
safe from that problem because every suggestion is anchored to one
specific job posting URL you're actively looking at, not a bare
freeform company name with no other context.

## Other known rough edges

- **Duplicate-list lookup cost:** the "Create files" flow pulls your
  _entire_ application list on every save just to find one record
  (`fetchCreatedRecord()` in `panel.js`), since the API doesn't return
  `excelRowText`/`starterPromptText` from the POST itself and no
  single-record GET endpoint is confirmed to exist. Fine at ~300
  records, but if you ever get (or already have) a
  `GET /api/job-applications/[id]` endpoint, that'd be a much cheaper
  swap: one line change in `fetchCreatedRecord()`.
- **No duplicate-record link on 409:** right now the duplicate warning
  (both the scrape-time one and the POST's 409) just tells you it's a
  duplicate; ideally this would link to the existing record. Can wire
  that up once the update flow exists to jump to it.
