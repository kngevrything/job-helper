// Glassdoor job page scraper.
//
// Checked against saved pages (2026-10), not a live session: Cloudflare
// blocks automated browsers on Glassdoor, so the user saved the pages
// from their own Chrome. Two page shapes, both handled:
//   - standalone:  /job-listing/<slug>-JV_...htm?jl=<id>  (alert emails)
//   - search split view:  /Job/...-SRCH_...htm  (job in a right-hand pane)
// Both render the same JobDetails header/description components, and the
// h1 carries the job id (id="jd-job-title-<id>"), so the DOM is tried
// FIRST, same reasoning as indeed.js. Only the standalone page emits
// JobPosting JSON-LD; the search page's document.title is the search's.
//
// Company name: the header can disagree with JSON-LD. One posting showed
// "Paladin Technologies" in the header and page title but "Bosch Building
// Technologies LLC" in JSON-LD hiringOrganization (and the URL slug). The
// header is what the user sees, so it wins, but a real mismatch drops
// confidence to 'medium' so the panel flags it for a check.
//
// Class names are CSS-module hashes (JobDetails_jobDescription__uW_fK),
// so selectors match the stable prefix only.

const LISTING_ORIGIN = 'https://www.glassdoor.com';

function textOf(el) {
  const text = el && el.innerText ? el.innerText.trim() : '';
  return text || null;
}

function titleHeading() {
  return document.querySelector('h1[id^="jd-job-title-"]');
}

function extractJobId(url) {
  const h1 = titleHeading();
  if (h1) {
    const m = h1.id.match(/^jd-job-title-(\d+)$/);
    if (m) return m[1];
  }
  const u = new URL(url);
  const fromUrl = u.searchParams.get('jl') || u.searchParams.get('jobListingId');
  if (fromUrl) return fromUrl;
  const selected = document.querySelector('[data-test="jobListing"][class*="selected"][data-jobid]');
  return selected ? selected.getAttribute('data-jobid') : null;
}

function findListingPath(jobId) {
  // On a standalone page the current path is the listing path. On the
  // search page, the listing URL for each job appears in the ItemList
  // JSON-LD and in page data, e.g. /job-listing/<slug>-JV_...htm?jl=<id>.
  if (/^\/job-listing\//.test(window.location.pathname)) return window.location.pathname;
  if (!jobId) return null;
  const re = new RegExp(`/job-listing/[^"'\\\\\\s?]+\\.htm(?=\\?jl=${jobId}\\b)`);
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    const m = (script.textContent || '').match(re);
    if (m) return m[0];
  }
  const link = document.querySelector(`a[href*="/job-listing/"][href*="jl=${jobId}"]`);
  if (link) return new URL(link.href).pathname;
  return null;
}

function canonicalJobUrl(rawUrl, jobId) {
  // Glassdoor's own JSON-LD lists listings on www.glassdoor.com even when
  // the page was served from a regional site (glassdoor.co.in), so the
  // saved link always uses the .com host and drops the tracking params.
  const path = findListingPath(jobId);
  if (path && jobId) return `${LISTING_ORIGIN}${path}?jl=${jobId}`;
  if (jobId) {
    // Search page whose selected job isn't in the server-rendered data
    // (clicked client-side). /Job/<search>.htm?jl=<id> is the format
    // Glassdoor's own serpUrlForJobListing uses: the search, with this
    // job open.
    return `${LISTING_ORIGIN}${new URL(rawUrl).pathname}?jl=${jobId}`;
  }
  return rawUrl.split('?')[0].split('#')[0];
}

function jsonLdJobPosting() {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent);
      const candidates = Array.isArray(data) ? data : [data];
      for (const item of candidates) {
        if (item && item['@type'] === 'JobPosting') return item;
      }
    } catch (e) {
      // malformed/unrelated JSON-LD block, keep looking
    }
  }
  return null;
}

function looselySameCompany(a, b) {
  // "FormFactor" vs "FormFactor, Inc." is the same company.
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const x = norm(a);
  const y = norm(b);
  return x.startsWith(y) || y.startsWith(x);
}

function tryDom() {
  const jobTitle = textOf(titleHeading());
  const header = document.querySelector('[data-test="job-details-header"]');
  const company = textOf(
    header && header.querySelector('[class*="EmployerProfile_employerNameHeading"]')
  );
  if (!jobTitle && !company) return null;

  let confidence = jobTitle && company ? 'high' : 'low';
  const posting = jsonLdJobPosting();
  const ldCompany = posting && posting.hiringOrganization && posting.hiringOrganization.name;
  if (confidence === 'high' && ldCompany && !looselySameCompany(company, ldCompany)) {
    confidence = 'medium';
  }
  return { jobTitle, company, confidence, via: 'dom' };
}

function tryJsonLd() {
  const item = jsonLdJobPosting();
  if (!item) return null;
  const company = (item.hiringOrganization && item.hiringOrganization.name) || null;
  const title = item.title || null;
  if (!title && !company) return null;
  return { jobTitle: title, company, confidence: 'high', via: 'json-ld' };
}

function tryDocumentTitle() {
  // Standalone page only: "Company hiring Job Title Job in City, ST |
  // Glassdoor". The search page's title is the search's.
  if (!/^\/job-listing\//.test(window.location.pathname)) return null;
  const raw = (document.title || '').replace(/\s*\|\s*Glassdoor\s*$/i, '').trim();
  const m = raw.match(/^(.*?)\s+hiring\s+(.*?)\s+Job(?:\s+in\s+.*)?$/i);
  if (!m) return null;
  return { jobTitle: m[2].trim(), company: m[1].trim(), confidence: 'low', via: 'document-title' };
}

function scrapeGlassdoor() {
  const result = tryDom() || tryJsonLd() || tryDocumentTitle() || {
    jobTitle: null,
    company: null,
    confidence: 'low',
    via: 'none',
  };

  const jobId = extractJobId(window.location.href);

  return {
    ok: true,
    source: 'glassdoor',
    jobTitle: result.jobTitle,
    company: result.company,
    jobUrl: canonicalJobUrl(window.location.href, jobId),
    jobId,
    confidence: result.confidence,
    scrapedVia: result.via,
  };
}

// ---------------------------------------------------------------------
// Job description scraping. DOM first: the description div holds the
// full text even while Glassdoor shows it collapsed ("blurDescription"),
// and it's the only source in the search split view.

function htmlDescriptionToText(html) {
  if (!html) return null;
  const withBreaks = html
    .replace(/<\s*li[^>]*>/gi, '\n- ')
    .replace(/<\s*(br|\/p|\/div|\/h[1-6])\s*\/?>/gi, '\n');
  const container = document.createElement('div');
  container.innerHTML = withBreaks;
  const text = container.textContent || '';
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function tidy(text) {
  const t = (text || '').replace(/\n{3,}/g, '\n\n').trim();
  return t || null;
}

function tryDescriptionDom() {
  const el = document.querySelector('[class*="JobDetails_jobDescription"]');
  return el ? tidy(el.innerText) : null;
}

function tryDescriptionJsonLd() {
  const item = jsonLdJobPosting();
  return item && item.description ? htmlDescriptionToText(item.description) : null;
}

function scrapeGlassdoorDescription() {
  const text = tryDescriptionDom() || tryDescriptionJsonLd();
  if (!text) {
    return { ok: false, error: 'Could not find a job description on this page.' };
  }
  return { ok: true, description: text };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'SCRAPE_JOB') {
    try {
      sendResponse(scrapeGlassdoor());
    } catch (err) {
      sendResponse({ ok: false, error: String(err) });
    }
    return true;
  }
  if (message && message.type === 'GET_JOB_DESCRIPTION') {
    try {
      sendResponse(scrapeGlassdoorDescription());
    } catch (err) {
      sendResponse({ ok: false, error: String(err) });
    }
    return true;
  }
  return true;
});
