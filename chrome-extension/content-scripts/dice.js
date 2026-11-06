// Dice job page scraper.
//
// Checked live (2026-11) in the built-in browser, no bot wall. Two page
// shapes, same header card (data-testid="job-detail-header-card"):
//   - search split view:  /jobs?...&selectedJobId=<guid>  (job in a
//     right-hand pane, data-testid="job-detail-pane")
//   - standalone:  /job-detail/<guid>  (also emits JobPosting JSON-LD)
// DOM is tried FIRST: the search page has no JSON-LD and its
// document.title is the search's.
//
// Job id gotcha: clicking a card DOES update selectedJobId, but if that
// job isn't in the current results (stale link, results reshuffled)
// Dice shows the FIRST card in the pane and leaves the stale id in the
// URL. So the id comes from the pane's own "Open in new tab" link
// (/job-detail/<guid>), and the URL param only as a last resort
// (confidence drops to 'medium').
//
// Narrow windows (~800px) still render the pane but at zero width,
// holding the first card's job, so a zero-width pane is ignored.

const ORIGIN = 'https://www.dice.com';
const GUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function isStandalone() {
  return /^\/job-detail\//.test(window.location.pathname);
}

function textOf(el) {
  const text = el && el.innerText ? el.innerText.trim() : '';
  return text || null;
}

function jobRoot() {
  // Element holding the job being viewed, or null.
  if (isStandalone()) return document;
  const pane = document.querySelector('[data-testid="job-detail-pane"]');
  if (!pane || pane.getBoundingClientRect().width === 0) return null;
  return pane;
}

function headerCard() {
  const root = jobRoot();
  return root ? root.querySelector('[data-testid="job-detail-header-card"]') : null;
}

function jsonLdJobPosting() {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent);
      const candidates = Array.isArray(data) ? data : data['@graph'] || [data];
      for (const item of candidates) {
        if (item && item['@type'] === 'JobPosting') return item;
      }
    } catch (e) {
      // malformed/unrelated JSON-LD block, keep looking
    }
  }
  return null;
}

function resolveJobId() {
  // { jobId, fromUrlParam }
  const header = headerCard();
  const link = header && header.querySelector('[data-testid="job-detail-open-in-new-tab-btn"]');
  const m = link && (link.getAttribute('href') || '').match(GUID_RE);
  if (m) return { jobId: m[0], fromUrlParam: false };

  if (isStandalone()) {
    const posting = jsonLdJobPosting();
    const ldId = posting && posting.identifier && posting.identifier.value;
    const pm = window.location.pathname.match(GUID_RE);
    return { jobId: ldId || (pm ? pm[0] : null), fromUrlParam: false };
  }

  const id = new URL(window.location.href).searchParams.get('selectedJobId');
  return { jobId: id && GUID_RE.test(id) ? id : null, fromUrlParam: !!id };
}

function canonicalJobUrl(jobId) {
  if (jobId) return `${ORIGIN}/job-detail/${jobId}`;
  // No id at all: keep the page as-is, minus any tracking params.
  const u = new URL(window.location.href);
  const keep = new URLSearchParams();
  for (const k of ['q', 'location', 'selectedJobId']) {
    if (u.searchParams.get(k)) keep.set(k, u.searchParams.get(k));
  }
  const qs = keep.toString();
  return `${u.origin}${u.pathname}${qs ? `?${qs}` : ''}`;
}

function tryDom() {
  const header = headerCard();
  if (!header) return null;
  const jobTitle = textOf(header.querySelector('h1'));
  // Company is a link whose href varies (/company-profile/<guid> or
  // /company/<slug>?companyname=...), but its analytics attribute is the
  // same on both. The logo's alt text is the fallback.
  let company = textOf(
    header.querySelector('a[data-wa-click="djv-job-company-profile-click"]') ||
      header.querySelector('a[href*="/company-profile/"], a[href*="/company/"]')
  );
  if (!company) {
    const img = header.querySelector('img[alt]');
    company = img && img.getAttribute('alt').trim() ? img.getAttribute('alt').trim() : null;
  }
  if (!jobTitle && !company) return null;
  return { jobTitle, company, confidence: jobTitle && company ? 'high' : 'low', via: 'dom' };
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
  // Standalone page only: "Title - Company - City, ST, US | Dice.com".
  // Split from the right, since titles can contain " - ".
  if (!isStandalone()) return null;
  const raw = (document.title || '').replace(/\s*\|\s*Dice\.com\s*$/i, '').trim();
  const parts = raw.split(' - ');
  if (parts.length < 3) return null;
  return {
    jobTitle: parts.slice(0, -2).join(' - ').trim(),
    company: parts[parts.length - 2].trim(),
    confidence: 'low',
    via: 'document-title',
  };
}

function scrapeDice() {
  const result = tryDom() || tryJsonLd() || tryDocumentTitle() || {
    jobTitle: null,
    company: null,
    confidence: 'low',
    via: 'none',
  };

  const job = resolveJobId();
  let confidence = result.confidence;
  if (confidence === 'high' && (job.fromUrlParam || !job.jobId)) confidence = 'medium';

  return {
    ok: true,
    source: 'dice',
    jobTitle: result.jobTitle,
    company: result.company,
    jobUrl: canonicalJobUrl(job.jobId),
    jobId: job.jobId,
    confidence,
    scrapedVia: result.via,
  };
}

// ---------------------------------------------------------------------
// Job description + salary. DOM first: the description div (CSS-module
// class "...__jobDescription", hash suffix varies) holds the full text,
// no collapse (the "Show more" in the pane belongs to the Skills list),
// and it's the only source on the search page. Salary is one of the
// header's info badges ("USD $160,001.00 - 200,000.00 per year",
// "USD75 - USD85"), present on some postings only.

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
  const root = jobRoot();
  const el = root && root.querySelector('[class*="jobDescription"]');
  return el ? tidy(el.innerText) : null;
}

function tryDescriptionJsonLd() {
  const item = jsonLdJobPosting();
  return item && item.description ? htmlDescriptionToText(item.description) : null;
}

function salaryFromBadges() {
  const header = headerCard();
  if (!header) return null;
  for (const badge of header.querySelectorAll('.SeuiInfoBadge')) {
    const t = textOf(badge);
    if (t && /\d/.test(t) && /USD|\$|per\s+(hour|year)/i.test(t)) return t;
  }
  return null;
}

function scrapeDiceDescription() {
  const text = tryDescriptionDom() || tryDescriptionJsonLd();
  if (!text) {
    return { ok: false, error: 'Could not find a job description on this page.' };
  }
  return { ok: true, description: text, salary: salaryFromBadges() };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'SCRAPE_JOB') {
    try {
      sendResponse(scrapeDice());
    } catch (err) {
      sendResponse({ ok: false, error: String(err) });
    }
    return true;
  }
  if (message && message.type === 'GET_JOB_DESCRIPTION') {
    try {
      sendResponse(scrapeDiceDescription());
    } catch (err) {
      sendResponse({ ok: false, error: String(err) });
    }
    return true;
  }
  return true;
});
