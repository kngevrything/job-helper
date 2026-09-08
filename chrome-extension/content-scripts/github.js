// GitHub careers (github.careers) job page scraper.
//
// GitHub's public job board is a white-labeled iCIMS "Company Hub" site
// (the login portal at careers-githubinc.icims.com confirms iCIMS under
// the hood), but the domain candidates actually browse is github.careers,
// not icims.com -- other iCIMS-powered career sites use their own custom
// domains too, so this scraper is matched to github.careers specifically
// rather than any general iCIMS pattern.
//
// Single-tenant site (only GitHub postings live here), so unlike
// Greenhouse/Workday/Ashby, company name is NOT guessed from a URL slug
// or subdomain -- it's hardcoded, which is more reliable than any of
// those guesses.
//
// Verified via a live fetch of a real posting
// (github.careers/careers-home/jobs/5611?lang=en-us): page <title> and
// og:title both read "{Job Title} in {Location} | GitHub, Inc.", e.g.
// "Staff Software Engineer in United States | GitHub, Inc.". That fetch
// found no JSON-LD JobPosting block, but it was a non-browser HTML fetch
// that may not reflect everything a real browser sees, so JSON-LD's
// absence isn't fully confirmed -- tryJsonLd() below is kept as an
// optional first tier in case a real browser turns up more than that
// fetch could show.
//
// Splitting the location back off the title is the fragile part: the
// suffix format is always "... in {Location}", and a title could itself
// contain " in " (e.g. "Engineer in Test" combined with a location would
// read "Engineer in Test in United States"). Splitting on the LAST " in "
// occurrence handles that correctly, since the location is always
// appended last. Only tested against one real posting's title text, so
// confidence is never above "medium" -- test against a couple more real
// postings before trusting this unattended, same caveat as Ashby.

function tryJsonLd() {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent);
      const candidates = Array.isArray(data) ? data : [data];
      for (const item of candidates) {
        if (item && item['@type'] === 'JobPosting' && item.title) {
          return { jobTitle: item.title, confidence: 'high', via: 'json-ld' };
        }
      }
    } catch (e) {
      // malformed JSON-LD on the page, ignore and keep looking
    }
  }
  return null;
}

function stripLocationSuffix(title) {
  const idx = title.lastIndexOf(' in ');
  return idx > -1 ? title.slice(0, idx).trim() : title.trim();
}

function scrapeFromMeta() {
  const ogTitle = document.querySelector('meta[property="og:title"]');
  const raw =
    (ogTitle && ogTitle.content && ogTitle.content.trim()) ||
    (document.title || '').trim() ||
    null;
  if (!raw) return null;
  // Both observed sources carry the same "{Title} in {Location} |
  // GitHub, Inc." suffix -- strip the "| GitHub, Inc." part first, then
  // the location.
  const withoutCompanySuffix = raw.replace(/\s*\|\s*GitHub,?\s*Inc\.?\s*$/i, '').trim();
  const jobTitle = stripLocationSuffix(withoutCompanySuffix);
  return jobTitle ? { jobTitle, confidence: 'medium', via: 'meta' } : null;
}

function extractJobId(url) {
  // Job URLs live under a few different path prefixes
  // (/careers-home/jobs/<id>, /early-in-profession/jobs/<id>, etc.), but
  // the id is always the numeric segment right after "/jobs/", so anchor
  // on that instead of a fixed prefix.
  const match = new URL(url).pathname.match(/\/jobs\/(\d+)/);
  return match ? match[1] : null;
}

function scrapeGithub() {
  const result = tryJsonLd() || scrapeFromMeta() || {
    jobTitle: null,
    confidence: 'low',
    via: 'none',
  };

  const canonicalLink = document.querySelector('link[rel="canonical"]');
  const jobUrl = canonicalLink
    ? canonicalLink.href
    : window.location.href.split('?')[0].split('#')[0];

  return {
    ok: true,
    source: 'github',
    jobTitle: result.jobTitle,
    company: 'GitHub',
    jobUrl,
    jobId: extractJobId(window.location.href),
    confidence: result.confidence,
    scrapedVia: result.via,
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'SCRAPE_JOB') {
    try {
      sendResponse(scrapeGithub());
    } catch (err) {
      sendResponse({ ok: false, error: String(err) });
    }
  }
  return true;
});
