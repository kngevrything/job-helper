// Ashby job page scraper (jobs.ashbyhq.com/{orgSlug}/{jobId}).
//
// Ashby job board pages are fully client-side rendered -- confirmed
// live against a real posting (this scraper was written by fetching
// https://jobs.ashbyhq.com/1password/c6933be3-... server-side): the
// initial HTML has no JSON-LD, no og:* meta tags, and <title> is just
// a static "Jobs" placeholder before the SPA hydrates. So instead of
// scraping rendered markup as the primary source (the way
// Greenhouse/Lever do), this calls Ashby's own public Job Board API --
// https://api.ashbyhq.com/posting-api/job-board/{orgSlug} -- the same
// unauthenticated JSON endpoint Ashby documents for embedding a job
// board on a company's own careers page. Confirmed live: a server-side
// GET against .../posting-api/job-board/1password returned
// { jobs: [{ id, title, jobUrl, ... }] }, no auth needed.
//
// IMPORTANT CAVEAT: that request was made server-side (no browser, no
// CORS enforcement), not from an actual content script in Chrome. I
// could not drive a real browser against jobs.ashbyhq.com this session
// (no Chrome connection available), so two things below are NOT
// confirmed the way the rest of this file is:
//   1. Whether api.ashbyhq.com sends CORS headers that actually allow
//      a fetch() from a jobs.ashbyhq.com content script. If it
//      doesn't, tryJobBoardApi() below fails closed (catches the
//      error, returns null) and this falls through to the DOM/title
//      tiers -- so worst case is a lower-confidence scrape, not a
//      broken one.
//   2. What document.title becomes once the SPA hydrates, and whether
//      there's a stable DOM selector for the job title/company. The
//      tiers below are best-effort, generic guesses, not verified
//      against a real rendered page.
// Test this against a real posting and tighten/replace the unverified
// tiers once you've seen what the hydrated page actually looks like.

function parseAshbyUrl(href) {
  const u = new URL(href);
  if (!/(^|\.)ashbyhq\.com$/i.test(u.hostname)) return null;

  const pathParts = u.pathname.split('/').filter(Boolean);
  if (pathParts.length < 2) return null;

  return {
    orgSlug: pathParts[0],
    jobId: pathParts[1],
  };
}

function slugToTitleCase(slug) {
  // Same rough last-resort guess as the Greenhouse/Lever scrapers --
  // not trusted as real branding/capitalization (e.g. won't recover
  // "1Password" from "1password").
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

async function tryJobBoardApi(orgSlug, jobId) {
  if (!orgSlug || !jobId) return null;
  let res;
  try {
    res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${orgSlug}`);
  } catch (e) {
    // Network or CORS failure -- fall through to DOM/title tiers.
    return null;
  }
  if (!res.ok) return null;
  let data;
  try {
    data = await res.json();
  } catch (e) {
    return null;
  }
  const jobs = Array.isArray(data && data.jobs) ? data.jobs : [];
  const match = jobs.find((j) => j && j.id === jobId);
  if (!match || !match.title) return null;
  // The API response has no company/organization name field at all
  // (confirmed against the same live response), only per-job fields --
  // so this tier only ever supplies jobTitle, never company.
  return { jobTitle: match.title, confidence: 'high', via: 'job-board-api' };
}

function tryDomTitle() {
  // NOT confirmed against a real rendered page. Generic h1 fallback,
  // same last-resort tier Greenhouse's scraper uses for its own DOM
  // fallback.
  const el = document.querySelector('h1');
  const text = el && el.textContent && el.textContent.trim();
  return text ? { jobTitle: text, confidence: 'low', via: 'dom' } : null;
}

function tryDocumentTitle() {
  // NOT confirmed live -- Ashby's static HTML title is just "Jobs"
  // before the SPA hydrates; unknown whether the client-side app ever
  // rewrites it, and if so in what format. Guards against still
  // reading that static placeholder.
  const raw = (document.title || '').trim();
  if (!raw || raw.toLowerCase() === 'jobs') return null;
  const parts = raw.split(/\s[-|]\s/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { jobTitle: parts[0], company: parts[1], confidence: 'low', via: 'document-title' };
  }
  return { jobTitle: parts[0], company: null, confidence: 'low', via: 'document-title' };
}

async function scrapeAshby() {
  const parsed = parseAshbyUrl(window.location.href);

  const apiResult = parsed ? await tryJobBoardApi(parsed.orgSlug, parsed.jobId) : null;
  const domResult = apiResult ? null : tryDomTitle();
  const titleResult = apiResult || domResult ? null : tryDocumentTitle();

  const best = apiResult || domResult || titleResult;
  let jobTitle = best ? best.jobTitle : null;
  let company = (titleResult && titleResult.company) || null;
  let confidence = best ? best.confidence : 'low';
  const viaParts = [apiResult, domResult, titleResult]
    .filter(Boolean)
    .map((r) => r.via);
  let via = viaParts.length ? viaParts.join('+') : 'none';

  let companyIsGuessed = false;
  if (!company && parsed) {
    company = slugToTitleCase(parsed.orgSlug);
    companyIsGuessed = true;
    via = via === 'none' ? 'url-slug-guess' : `${via}+url-slug-guess`;
  }
  if (companyIsGuessed && confidence === 'high') {
    // Job title came back solid from the API, but company is still a
    // pure URL-slug guess -- don't call the whole result high
    // confidence on the strength of only one field.
    confidence = 'medium';
  }

  const jobUrl = parsed
    ? `https://jobs.ashbyhq.com/${parsed.orgSlug}/${parsed.jobId}`
    : window.location.href.split('?')[0].split('#')[0];

  return {
    ok: true,
    source: 'ashby',
    jobTitle,
    company,
    jobUrl,
    jobId: parsed ? parsed.jobId : null,
    confidence,
    scrapedVia: via,
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'SCRAPE_JOB') {
    scrapeAshby()
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true; // async response, keep the message channel open
  }
  return true;
});
