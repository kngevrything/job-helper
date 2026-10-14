// Jobright (jobright.ai) job page scraper.
//
// Job pages live at /jobs/info/<24-hex id>. Verified live (2026-10) on
// one real posting: a plain fetch gets a JavaScript security-check
// interstitial, but in a real browser the rendered page carries:
//   - a JobPosting JSON-LD block (title, hiringOrganization.name,
//     identifier.value = the job id, baseSalary, description)
//   - __NEXT_DATA__ with props.pageProps.dataSource.jobResult
//     (jobId, jobTitle, salaryDesc like "$300K/yr - $385K/yr")
//   - DOM: <h1 class="...index_job-title__..."> and
//     <span class="...index_company-name__...">. Class suffixes are CSS
//     module hashes, so selectors match on the stable prefix only.
//
// The JSON-LD title can carry a "[Remote] " prefix; the h1 doesn't, so
// the DOM is tried first (it also always reflects the job on screen).
//
// The description is NOT the employer's original JD. Jobright rewrites
// every posting into its own Responsibilities / Qualification /
// Benefits / Company sections, and the JSON-LD description is that
// rewrite. The original only exists on the company's site behind
// Jobright's Apply button.
//
// Jobright is a Next.js app. Whether it swaps jobs client-side without
// refreshing JSON-LD/__NEXT_DATA__ is unknown, so structured data is
// only trusted when its job id matches the id in the current URL.

function extractJobId(url) {
  const match = new URL(url).pathname.match(/\/jobs\/info\/([0-9a-f]{24})/i);
  return match ? match[1] : null;
}

function textOf(selector) {
  const el = document.querySelector(selector);
  const text = el && el.innerText ? el.innerText.trim() : '';
  return text || null;
}

function readJsonLd(jobId) {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent);
      const candidates = Array.isArray(data) ? data : [data];
      for (const item of candidates) {
        if (!item || item['@type'] !== 'JobPosting') continue;
        const id = item.identifier && item.identifier.value;
        if (jobId && id && id !== jobId) continue; // stale, from another job
        return item;
      }
    } catch (e) {
      // malformed/unrelated JSON-LD block, keep looking
    }
  }
  return null;
}

function readNextJobResult(jobId) {
  const el = document.getElementById('__NEXT_DATA__');
  if (!el) return null;
  try {
    const data = JSON.parse(el.textContent);
    const ds = data.props && data.props.pageProps && data.props.pageProps.dataSource;
    const jr = ds && ds.jobResult;
    if (!jr || (jobId && jr.jobId !== jobId)) return null;
    return { job: jr, company: ds.companyResult || null };
  } catch (e) {
    return null;
  }
}

function tryDom() {
  const jobTitle = textOf('h1[class*="index_job-title"]');
  const company = textOf('[class*="index_company-name"]');
  if (jobTitle || company) {
    return { jobTitle, company, confidence: jobTitle && company ? 'high' : 'low', via: 'dom' };
  }
  return null;
}

function tryNextData(jobId) {
  const next = readNextJobResult(jobId);
  if (!next) return null;
  const jobTitle = next.job.jobTitle || null;
  const company = (next.company && next.company.companyName) || null;
  if (jobTitle || company) {
    return { jobTitle, company, confidence: jobTitle && company ? 'high' : 'low', via: 'next-data' };
  }
  return null;
}

function tryJsonLd(jobId) {
  const item = readJsonLd(jobId);
  if (!item) return null;
  const jobTitle = item.title ? item.title.replace(/^\s*\[[^\]]*\]\s*/, '').trim() : null;
  const company = (item.hiringOrganization && item.hiringOrganization.name) || null;
  if (jobTitle || company) {
    return { jobTitle, company, confidence: jobTitle && company ? 'high' : 'low', via: 'json-ld' };
  }
  return null;
}

function tryDocumentTitle() {
  // "Chief Architect @ Legion Technologies | Jobright.ai"
  const raw = (document.title || '').replace(/\s*\|\s*Jobright(\.ai)?\s*$/i, '').trim();
  const idx = raw.lastIndexOf(' @ ');
  if (idx < 0) return null;
  return {
    jobTitle: raw.slice(0, idx).trim() || null,
    company: raw.slice(idx + 3).trim() || null,
    confidence: 'medium',
    via: 'document-title',
  };
}

function scrapeJobright() {
  const jobId = extractJobId(window.location.href);
  const empty = { jobTitle: null, company: null, confidence: 'low', via: 'none' };
  // Off a /jobs/info/ page (list, search, etc.) there's no single job.
  const result = jobId
    ? tryDom() || tryNextData(jobId) || tryJsonLd(jobId) || tryDocumentTitle() || empty
    : empty;

  return {
    ok: true,
    source: 'jobright',
    jobTitle: result.jobTitle,
    company: result.company,
    // Drops utm_*/imp_id tracking params; matches <link rel="canonical">.
    jobUrl: jobId
      ? `${window.location.origin}/jobs/info/${jobId}`
      : window.location.href.split('?')[0].split('#')[0],
    jobId,
    confidence: result.confidence,
    scrapedVia: result.via,
  };
}

// ---------------------------------------------------------------------
// Job description + salary.

function htmlDescriptionToText(html) {
  if (!html) return null;
  const withBreaks = html
    .replace(/<\s*li[^>]*>/gi, '\n- ')
    .replace(/<\s*(br|\/p|\/div|\/h[1-6])\s*\/?>/gi, '\n');
  const container = document.createElement('div');
  container.innerHTML = withBreaks;
  const text = container.textContent || '';
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() || null;
}

function formatK(n) {
  return n >= 1000 ? `$${Math.round(n / 1000)}K` : `$${n}`;
}

function salaryFromJsonLd(item) {
  const v = item && item.baseSalary && item.baseSalary.value;
  if (!v || (!v.minValue && !v.maxValue)) return null;
  const unit = { YEAR: '/yr', HOUR: '/hr', MONTH: '/mo' }[v.unitText] || '';
  const min = v.minValue ? formatK(v.minValue) + unit : null;
  const max = v.maxValue ? formatK(v.maxValue) + unit : null;
  return min && max && min !== max ? `${min} - ${max}` : min || max;
}

function scrapeJobrightDescription() {
  const jobId = extractJobId(window.location.href);
  if (!jobId) {
    return { ok: false, error: 'Not a Jobright job page.' };
  }
  const item = readJsonLd(jobId);
  const description = item ? htmlDescriptionToText(item.description) : null;
  if (!description) {
    return { ok: false, error: 'Could not find a job description on this page.' };
  }
  const next = readNextJobResult(jobId);
  const salary = (next && next.job.salaryDesc) || salaryFromJsonLd(item) || null;
  return { ok: true, description, salary };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'SCRAPE_JOB') {
    try {
      sendResponse(scrapeJobright());
    } catch (err) {
      sendResponse({ ok: false, error: String(err) });
    }
    return true;
  }
  if (message && message.type === 'GET_JOB_DESCRIPTION') {
    try {
      sendResponse(scrapeJobrightDescription());
    } catch (err) {
      sendResponse({ ok: false, error: String(err) });
    }
    return true;
  }
  return true;
});
