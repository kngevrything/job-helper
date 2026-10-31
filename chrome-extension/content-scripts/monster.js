// Monster job page scraper.
//
// Checked live (2026-10) on two page shapes:
//   - search split view:  /jobs/search?q=...&id=<uuid>  (alert emails;
//     job in a right-hand pane, only at desktop width)
//   - standalone:  /job-openings/<slug>--<uuid>
// Both render the same job view (data-testid="svx-job-view-wrapper"),
// with the title as h2 in the pane and h1 standalone. DOM is tried
// FIRST, same reasoning as indeed.js: only the standalone page emits
// JobPosting JSON-LD, and the search page's document.title is the
// search's.
//
// Job id gotcha: on the search page, clicking another card does NOT
// update the URL's `id` param, and the card buttons' aria-pressed stays
// on the first job too. Only the article's `card-selected` class moves.
// So the id comes from the card whose aria-label ("<title> at
// <company>") matches the pane, then the selected card, and the URL
// `id` only as a last resort (confidence drops to 'medium').
//
// Job URL: /job-openings/<slug>--<uuid> needs Monster's own slug; a
// guessed slug returns 410 Gone. So the link comes from the card's
// anchor, never built by hand.
//
// Below ~1000px wide Monster shows no pane on the search page, so
// there's nothing to scrape there except the list.

const ORIGIN = 'https://www.monster.com';
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function isStandalone() {
  return /^\/job-openings\//.test(window.location.pathname);
}

function textOf(el) {
  const text = el && el.innerText ? el.innerText.trim() : '';
  return text || null;
}

function jobView() {
  return document.querySelector('[data-testid="svx-job-view-wrapper"]');
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

function paneFields() {
  const view = jobView();
  if (!view) return { jobTitle: null, company: null };
  return {
    jobTitle: textOf(view.querySelector('[data-testid="jobTitle"]')),
    company: textOf(view.querySelector('[data-testid="company"]')),
  };
}

function cardForPane(jobTitle, company) {
  // Returns the <article> card for the job in the pane, or null.
  const cards = [...document.querySelectorAll('article[data-testid="JobCard"]')];
  if (cards.length === 0) return null;
  const isSelected = (c) => c.classList.contains('card-selected');
  if (jobTitle && company) {
    const label = `${jobTitle} at ${company}`;
    const matches = cards.filter((c) => {
      const btn = c.querySelector('[data-testid="JobCardButton"]');
      return btn && btn.getAttribute('aria-label') === label;
    });
    if (matches.length) return matches.find(isSelected) || matches[0];
  }
  return cards.find(isSelected) || null;
}

function resolveJob(jobTitle, company) {
  // { jobId, path, fromUrlParam }
  if (isStandalone()) {
    const m = window.location.pathname.match(UUID_RE);
    const posting = jsonLdJobPosting();
    const ldId = posting && posting.identifier && posting.identifier.value;
    return { jobId: ldId || (m ? m[0] : null), path: window.location.pathname, fromUrlParam: false };
  }
  const card = cardForPane(jobTitle, company);
  if (card) {
    const btn = card.querySelector('[data-job-id]');
    const link = card.querySelector('a[href*="/job-openings/"]');
    return {
      jobId: btn ? btn.getAttribute('data-job-id') : null,
      path: link ? new URL(link.href).pathname : null,
      fromUrlParam: false,
    };
  }
  const id = new URL(window.location.href).searchParams.get('id');
  return { jobId: id && UUID_RE.test(id) ? id : null, path: null, fromUrlParam: !!id };
}

function canonicalJobUrl(rawUrl, path) {
  if (path) return `${ORIGIN}${path}`;
  // No card link (shouldn't happen when a pane is open): keep the
  // search with this job open, minus the email tracking params.
  const u = new URL(rawUrl);
  const keep = new URLSearchParams();
  for (const k of ['q', 'where', 'id']) {
    if (u.searchParams.get(k)) keep.set(k, u.searchParams.get(k));
  }
  const qs = keep.toString();
  return `${u.origin}${u.pathname}${qs ? `?${qs}` : ''}`;
}

function tryDom() {
  const { jobTitle, company } = paneFields();
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
  // Standalone page only: "Title Job [REMOTE] - Company - (Hiring Now) - Monster".
  if (!isStandalone()) return null;
  const raw = (document.title || '').replace(/\s*-\s*Monster\s*$/i, '').trim();
  const m = raw.match(/^(.*?)\s+Job(?:\s+\[[^\]]*\])?(?:\s+in\s+.*?)?\s+-\s+(.*?)(?:\s+-\s+\(.*\))?$/);
  if (!m) return null;
  return { jobTitle: m[1].trim(), company: m[2].trim(), confidence: 'low', via: 'document-title' };
}

function scrapeMonster() {
  const result = tryDom() || tryJsonLd() || tryDocumentTitle() || {
    jobTitle: null,
    company: null,
    confidence: 'low',
    via: 'none',
  };

  const job = resolveJob(result.jobTitle, result.company);
  let confidence = result.confidence;
  if (confidence === 'high' && (job.fromUrlParam || !job.jobId)) confidence = 'medium';

  return {
    ok: true,
    source: 'monster',
    jobTitle: result.jobTitle,
    company: result.company,
    jobUrl: canonicalJobUrl(window.location.href, job.path),
    jobId: job.jobId,
    confidence,
    scrapedVia: result.via,
  };
}

// ---------------------------------------------------------------------
// Job description + salary. DOM first: the description container holds
// the full text (no collapse; the "+ show more" in the pane belongs to
// the skills widget), and it's the only source on the search page.
// Salary comes from the pane's facts table ("Salary  $160,000–$200,000
// Per Year"), which only some postings have.

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
  // At narrow widths the standalone page collapses the description and
  // its "Show more" button label lands at the end of innerText. The full
  // text is still there, so just drop the label.
  const view = jobView();
  const el = view && view.querySelector('[data-testid="svx-description-container-inner"]');
  return el ? tidy(el.innerText.replace(/\n\s*Show (more|less)\s*$/i, '')) : null;
}

function tryDescriptionJsonLd() {
  const item = jsonLdJobPosting();
  return item && item.description ? htmlDescriptionToText(item.description) : null;
}

function salaryFromFacts() {
  const view = jobView();
  const table = view && view.querySelector('[data-testid="svx-numbers-and-facts-container-inner"]');
  if (!table) return null;
  for (const line of (table.innerText || '').split('\n')) {
    const m = line.match(/^\s*Salary\s*\t\s*(.+)$/i);
    if (m && m[1].trim()) return m[1].trim();
  }
  return null;
}

function scrapeMonsterDescription() {
  const text = tryDescriptionDom() || tryDescriptionJsonLd();
  if (!text) {
    return { ok: false, error: 'Could not find a job description on this page.' };
  }
  return { ok: true, description: text, salary: salaryFromFacts() };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'SCRAPE_JOB') {
    try {
      sendResponse(scrapeMonster());
    } catch (err) {
      sendResponse({ ok: false, error: String(err) });
    }
    return true;
  }
  if (message && message.type === 'GET_JOB_DESCRIPTION') {
    try {
      sendResponse(scrapeMonsterDescription());
    } catch (err) {
      sendResponse({ ok: false, error: String(err) });
    }
    return true;
  }
  return true;
});
