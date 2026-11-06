// Eightfold AI career site scraper ("PCS" / Personalized Career Site).
// Eightfold tenants often live on the company's own domain (e.g.
// jobs.autodesk.com) rather than an eightfold.ai subdomain, so the
// manifest lists known hosts explicitly.
//
// Data comes from Eightfold's own JSON API, the same one the page calls:
//   /api/pcsx/position_details?position_id={id}&domain={domain}&hl=en
// Same-origin fetch from the content script, so no CORS issue. Verified
// against a real Autodesk posting (1443152974326): returns name,
// displayJobId ("26WD97363", the req number shown on the page and the
// same id workday.js extracts for Autodesk), publicUrl, and
// jobDescription as HTML. It does NOT return a company name.

function extractPositionId(href) {
  const u = new URL(href);
  // Standalone job page: /careers/job/{id}
  const pathMatch = u.pathname.match(/\/careers\/job\/(\d+)/);
  if (pathMatch) return pathMatch[1];
  // List view with a job selected in the side pane: /careers?pid={id}
  const pid = u.searchParams.get('pid');
  if (pid && /^\d+$/.test(pid)) return pid;
  return null;
}

function detectTenantDomain() {
  // The page config embeds the tenant as "domain": "autodesk.com".
  // Observed on Autodesk; not yet confirmed on other tenants.
  const html = document.documentElement.innerHTML;
  const m = html.match(/"domain"\s*:\s*"([a-z0-9.-]+\.[a-z]{2,})"/i);
  if (m) return m[1];
  // Fallback guess: jobs.autodesk.com -> autodesk.com,
  // fortive.eightfold.ai -> fortive.com.
  const host = window.location.hostname;
  const parts = host.split('.');
  if (/\.eightfold\.ai$/i.test(host)) return `${parts[0]}.com`;
  return parts.slice(-2).join('.');
}

function companyFromPage(domain) {
  const site = document.querySelector('meta[property="og:site_name"]');
  if (site && site.content && site.content.trim()) {
    return { company: site.content.trim(), guessed: false };
  }
  // Rough title-case of the domain's first label, same style of guess as
  // workday.js's deriveCompanyFromTenant(). The panel's casing check
  // corrects it against saved companies.
  const label = domain.split('.')[0];
  const company = label
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
  return { company, guessed: true };
}

function htmlDescriptionToText(html) {
  if (!html) return null;
  const withBreaks = html
    .replace(/<\s*li[^>]*>/gi, '\n- ')
    .replace(/<\s*(br|\/p|\/div|\/h[1-6])\s*\/?>/gi, '\n');
  // DOMParser builds an inert document (no scripts or image loads run),
  // unlike innerHTML on an element of the live page.
  const doc = new DOMParser().parseFromString(withBreaks, 'text/html');
  const text = (doc.body && doc.body.textContent) || '';
  return text
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim() || null;
}

async function fetchPositionDetails() {
  const positionId = extractPositionId(window.location.href);
  if (!positionId) return { positionId: null, domain: null, data: null };
  const domain = detectTenantDomain();
  const apiUrl =
    `/api/pcsx/position_details?position_id=${encodeURIComponent(positionId)}` +
    `&domain=${encodeURIComponent(domain)}&hl=en`;
  const res = await fetch(apiUrl, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Eightfold API returned HTTP ${res.status}`);
  const json = await res.json();
  return { positionId, domain, data: (json && json.data) || null };
}

async function scrapeEightfold() {
  const { positionId, domain, data } = await fetchPositionDetails();
  if (!positionId) {
    return { ok: false, error: 'No job selected on this page.' };
  }

  const { company, guessed } = companyFromPage(domain);
  const jobTitle = (data && data.name) || null;
  const jobId = (data && (data.displayJobId || data.atsJobId)) || null;
  const jobUrl =
    (data && data.publicUrl) ||
    `${window.location.origin}/careers/job/${positionId}`;

  // "high" only when the API gave title + id AND the company wasn't a
  // domain guess, matching workday.js's rule.
  let confidence = 'low';
  if (jobTitle && jobId && !guessed) confidence = 'high';
  else if (jobTitle) confidence = 'medium';

  return {
    ok: true,
    source: 'eightfold',
    jobTitle,
    company,
    jobUrl,
    jobId,
    confidence,
    scrapedVia: data ? 'eightfold-api' : 'none',
  };
}

async function scrapeEightfoldDescription() {
  const { data } = await fetchPositionDetails();
  const text = data ? htmlDescriptionToText(data.jobDescription) : null;
  if (!text) {
    return { ok: false, error: 'Could not find a job description on this page.' };
  }
  return { ok: true, description: text };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'SCRAPE_JOB') {
    scrapeEightfold()
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (message && message.type === 'GET_JOB_DESCRIPTION') {
    scrapeEightfoldDescription()
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  return true;
});
