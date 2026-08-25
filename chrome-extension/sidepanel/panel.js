// ---- Storage helpers -------------------------------------------------

async function getApiBaseUrl() {
  const { apiBaseUrl } = await chrome.storage.local.get('apiBaseUrl');
  return apiBaseUrl || '';
}

async function setApiBaseUrl(url) {
  await chrome.storage.local.set({ apiBaseUrl: url });
}

function normalizeBaseUrl(raw) {
  // Strip trailing slash so we can safely do `${base}/api/...`.
  return raw.trim().replace(/\/+$/, '');
}

function originPatternFor(baseUrl) {
  try {
    const u = new URL(baseUrl);
    return `${u.protocol}//${u.host}/*`;
  } catch {
    return null;
  }
}

// ---- Permission handling ----------------------------------------------
// The Mongo API's origin isn't known at build time (localhost in dev,
// a homelab hostname otherwise), so it isn't in the manifest's static
// host_permissions. Instead we request it at runtime, scoped to exactly
// the origin the user enters, via the optional_host_permissions declared
// in manifest.json.

async function hasApiPermission(baseUrl) {
  const pattern = originPatternFor(baseUrl);
  if (!pattern) return false;
  try {
    return await chrome.permissions.contains({ origins: [pattern] });
  } catch {
    return false;
  }
}

async function requestApiPermission(baseUrl) {
  const pattern = originPatternFor(baseUrl);
  if (!pattern) throw new Error('That does not look like a valid URL.');
  return chrome.permissions.request({ origins: [pattern] });
}

// ---- Draft autosave -----------------------------------------------------
// Belt-and-suspenders on top of the side panel's persistence: if the
// panel gets closed (or Chrome restarts), whatever was typed isn't lost.
// Saved on every edit, cleared once a save to the API succeeds.

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

async function loadDraft() {
  const { draft } = await chrome.storage.local.get('draft');
  return draft || null;
}

async function saveDraft() {
  const draft = {
    jobTitle: els.jobTitle.value,
    company: els.company.value,
    jobUrl: els.jobUrl.value,
    jobId: els.jobId.value,
    createFiles: els.createFiles.checked,
  };
  await chrome.storage.local.set({ draft });
}

async function clearDraft() {
  await chrome.storage.local.remove('draft');
}

const saveDraftDebounced = debounce(saveDraft, 300);

function attachDraftAutosave() {
  [els.jobTitle, els.company, els.jobUrl, els.jobId].forEach((el) => {
    el.addEventListener('input', saveDraftDebounced);
  });
  els.createFiles.addEventListener('change', saveDraftDebounced);
}

// ---- DOM refs -----------------------------------------------------------

const els = {
  settingsToggle: document.getElementById('settingsToggle'),
  settingsPanel: document.getElementById('settingsPanel'),
  apiBaseUrlInput: document.getElementById('apiBaseUrl'),
  connectBtn: document.getElementById('connectBtn'),
  connectionStatus: document.getElementById('connectionStatus'),
  notConnectedNotice: document.getElementById('notConnectedNotice'),
  scrapeNotice: document.getElementById('scrapeNotice'),
  duplicateNotice: document.getElementById('duplicateNotice'),
  casingConflictNotice: document.getElementById('casingConflictNotice'),
  casingConflictText: document.getElementById('casingConflictText'),
  useCasingSuggestionBtn: document.getElementById('useCasingSuggestionBtn'),
  form: document.getElementById('captureForm'),
  jobTitle: document.getElementById('jobTitle'),
  company: document.getElementById('company'),
  jobUrl: document.getElementById('jobUrl'),
  jobId: document.getElementById('jobId'),
  createFiles: document.getElementById('createFiles'),
  rescanBtn: document.getElementById('rescanBtn'),
  clearDraftBtn: document.getElementById('clearDraftBtn'),
  submitBtn: document.getElementById('submitBtn'),
  resultMessage: document.getElementById('resultMessage'),
  outputsSection: document.getElementById('outputsSection'),
  excelRowOutput: document.getElementById('excelRowOutput'),
  starterPromptOutput: document.getElementById('starterPromptOutput'),
};

let connected = false;

// ---- Settings UI --------------------------------------------------------

els.settingsToggle.addEventListener('click', () => {
  els.settingsPanel.classList.toggle('hidden');
});

els.connectBtn.addEventListener('click', async () => {
  const raw = els.apiBaseUrlInput.value;
  if (!raw.trim()) {
    els.connectionStatus.textContent = 'Enter a URL first.';
    return;
  }
  const baseUrl = normalizeBaseUrl(raw);
  try {
    const granted = await requestApiPermission(baseUrl);
    if (granted) {
      await setApiBaseUrl(baseUrl);
      connected = true;
      els.connectionStatus.textContent = `Connected to ${baseUrl}`;
      els.notConnectedNotice.classList.add('hidden');
      updateSubmitEnabled();
    } else {
      els.connectionStatus.textContent = 'Permission denied.';
    }
  } catch (err) {
    els.connectionStatus.textContent = `Error: ${err.message}`;
  }
});

function updateSubmitEnabled() {
  els.submitBtn.disabled = !connected;
}

// ---- Scraping -------------------------------------------------------

function showScrapeNotice(text, isWarning) {
  els.scrapeNotice.textContent = text;
  els.scrapeNotice.classList.remove('hidden');
  els.scrapeNotice.style.background = isWarning ? '#fff8e1' : '#e6f4ea';
  els.scrapeNotice.style.borderColor = isWarning ? '#ffe082' : '#a8dab5';
}

function populateForm(scraped) {
  els.jobTitle.value = scraped.jobTitle || '';
  els.company.value = scraped.company || '';
  els.jobUrl.value = scraped.jobUrl || '';
  els.jobId.value = scraped.jobId || '';
}

async function getSourceTab() {
  // Side panel pages (unlike a detached secondary window) have an accurate
  // "current window" context matching the browser window they're docked
  // to, so a plain currentWindow query correctly finds the tab you're
  // looking at, even after switching tabs while the panel stays open.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

function detectSite(url) {
  const host = new URL(url).hostname;
  if (/(^|\.)greenhouse\.io$/.test(host)) return 'greenhouse';
  if (/(^|\.)linkedin\.com$/.test(host)) return 'linkedin';
  if (/(^|\.)myworkdayjobs\.com$/.test(host)) return 'workday';
  if (/(^|\.)lever\.co$/.test(host)) return 'lever';
  if (/(^|\.)ashbyhq\.com$/.test(host)) return 'ashby';
  return null;
}

const CONTENT_SCRIPT_BY_SITE = {
  greenhouse: 'content-scripts/greenhouse.js',
  linkedin: 'content-scripts/linkedin.js',
  workday: 'content-scripts/workday.js',
  lever: 'content-scripts/lever.js',
  ashby: 'content-scripts/ashby.js',
};

async function injectContentScript(tabId, site) {
  const file = CONTENT_SCRIPT_BY_SITE[site];
  if (!file) return false;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: [file] });
    return true;
  } catch (err) {
    return false;
  }
}

// ---- Duplicate check ------------------------------------------------
// Read-only companion to the 409 the API's POST already returns -- this
// fires right after a scrape (or a restored draft) populates the form,
// so you see "you've already applied to this" before investing any
// effort, not just at submit time. It is NOT a substitute for the
// POST's 409: the gap between this check and a later Save is still
// real (e.g. the Next.js app open in another tab at the same moment),
// so Save stays enabled regardless of what this shows -- it's an early
// warning, not a lock. Fails silently on any network/API error, same
// as the rest of the capture flow -- a broken dupe check should never
// block or alarm you about something it couldn't actually verify.

function duplicateNoticeText(data) {
  const appliedDate = data.createdAt
    ? new Date(data.createdAt).toLocaleDateString()
    : null;
  const statusText = data.endedAt
    ? `${data.status} (ended ${new Date(data.endedAt).toLocaleDateString()})`
    : data.status;
  return appliedDate
    ? `Already applied: ${statusText}, applied ${appliedDate}.`
    : `Already applied: ${statusText}.`;
}

function showDuplicateNotice(text) {
  els.duplicateNotice.textContent = text;
  els.duplicateNotice.classList.remove('hidden');
}

function hideDuplicateNotice() {
  els.duplicateNotice.classList.add('hidden');
  els.duplicateNotice.textContent = '';
}

async function checkDuplicate(company, jobId) {
  if (!company || !jobId) {
    hideDuplicateNotice();
    return;
  }

  const apiBaseUrl = await getApiBaseUrl();
  if (!apiBaseUrl || !(await hasApiPermission(apiBaseUrl))) {
    hideDuplicateNotice();
    return;
  }

  let data = null;
  try {
    const url =
      `${apiBaseUrl}/api/job-applications/check` +
      `?company=${encodeURIComponent(company)}&jobId=${encodeURIComponent(jobId)}`;
    const res = await fetch(url);
    if (res.ok) {
      const payload = await res.json().catch(() => null);
      if (payload && payload.ok && payload.exists && payload.data) {
        data = payload.data;
      }
    }
  } catch (err) {
    // API unreachable -- say nothing rather than guess.
  }

  if (!data) {
    hideDuplicateNotice();
    return;
  }

  // Only touch the DOM if the outcome actually changed -- re-checking
  // mid-typing (blur, debounce tick) while the same duplicate is still
  // in effect would otherwise hide and re-show this on every check,
  // which is what caused the form to visibly jump while typing.
  const text = duplicateNoticeText(data);
  if (els.duplicateNotice.classList.contains('hidden') || els.duplicateNotice.textContent !== text) {
    showDuplicateNotice(text);
  }
}

// The scrape/draft-restore paths above cover captures that came from a
// page scrape, but company/jobId can also be typed or fixed by hand (a
// bad scrape, or a site with no scraper at all) -- so this also
// re-checks on those two fields directly: on a debounce while typing
// (longer than the draft-autosave debounce, since this is a network
// round trip and firing on every keystroke would be wasteful), and
// immediately on blur so leaving the field doesn't wait out the
// debounce.

let duplicateCheckTimer = null;

function scheduleDuplicateCheck() {
  clearTimeout(duplicateCheckTimer);
  duplicateCheckTimer = setTimeout(() => {
    checkDuplicate(els.company.value.trim(), els.jobId.value.trim());
  }, 600);
}

function duplicateCheckNow() {
  clearTimeout(duplicateCheckTimer);
  checkDuplicate(els.company.value.trim(), els.jobId.value.trim());
}

function attachDuplicateCheckTriggers() {
  [els.company, els.jobId].forEach((el) => {
    el.addEventListener('input', scheduleDuplicateCheck);
    el.addEventListener('blur', duplicateCheckNow);
  });
}

// ---- Company casing lookup ---------------------------------------------
// Every scraper falls back to a guessed casing for company when the
// real page/API data doesn't give one (a title-cased guess off the
// URL's org slug or Workday's tenant subdomain -- see docs/notes.md).
// That guess is usually wrong for stylized names ("1password" instead
// of "1Password"), and letting it through as-typed means the same
// company ends up saved under multiple casings across records, which
// reads as different companies anywhere casing isn't collation-aware
// (e.g. a plain-text search). This looks up whatever casing you've
// already used for that company (case-insensitive, same
// DUPLICATE_MATCH_COLLATION the duplicate check uses server-side) and
// either corrects the field automatically or, if the scrape itself was
// high confidence and still disagrees, surfaces it as a low-key
// suggestion instead of guessing which one is right.
//
// "Confidence" here is the scraper's overall `confidence` field -- there
// is no separate per-field signal for company alone. Every scraper
// already downgrades that field to medium/low specifically when company
// came from a slug/subdomain guess rather than real page or API data
// (see each content-scripts/*.js), so "not high" is already a reliable
// proxy for "company is probably a guess" here.
//
// Called two ways: right after a scrape populates the form (see
// runScrape()), using that scraper's own confidence -- and on manual
// typing/blur in the company field (see attachCasingCheckTriggers()
// below), always passed confidence 'high'. A hand-typed value is
// deliberate the same way a scraper's high-confidence page/API data
// is, so it gets the same treatment: never silently overwritten, just
// offered as a one-click fix if it disagrees with history. Not run on
// draft-restore -- a restored draft was already checked (as a scrape
// or as manual input) before it was saved as a draft.

function hideCasingConflict() {
  els.casingConflictNotice.classList.add('hidden');
  els.casingConflictText.textContent = '';
  els.useCasingSuggestionBtn.textContent = '';
  els.useCasingSuggestionBtn.onclick = null;
}

function showCasingSuggestion(savedCompany) {
  // Scraped value stays in the field untouched -- it's already
  // high-confidence, so it's the safer default. This is an opt-in
  // correction, not a forced pick between two buttons.
  els.casingConflictText.textContent = "You've saved this company as:";
  els.useCasingSuggestionBtn.textContent = savedCompany;
  els.useCasingSuggestionBtn.onclick = () => {
    els.company.value = savedCompany;
    hideCasingConflict();
    saveDraftDebounced();
  };
  els.casingConflictNotice.classList.remove('hidden');
}

async function checkCompanyCasing(company, confidence) {
  if (!company) {
    hideCasingConflict();
    return;
  }

  const apiBaseUrl = await getApiBaseUrl();
  if (!apiBaseUrl || !(await hasApiPermission(apiBaseUrl))) {
    hideCasingConflict();
    return;
  }

  let suggestion = null;
  try {
    const url =
      `${apiBaseUrl}/api/job-applications/company-casing` +
      `?company=${encodeURIComponent(company)}`;
    const res = await fetch(url);
    if (res.ok) {
      const payload = await res.json().catch(() => null);
      const saved = payload && payload.ok ? payload.company : null;
      if (saved && saved !== company) {
        if (confidence === 'high') {
          // Real page/API data still disagrees with history -- could be
          // the company's branding actually changed, or old DB data was
          // entered inconsistently. Don't guess which is right; leave
          // the scraped value in place and offer the saved casing as a
          // one-click fix.
          suggestion = saved;
        } else {
          // Normal case: company was a guess (see comment above).
          // Silently correct it against what's already in the DB.
          els.company.value = saved;
          await saveDraft();
        }
      }
    }
  } catch (err) {
    // API unreachable -- say nothing rather than guess, same as the
    // duplicate check.
  }

  // Only touch the DOM if the outcome actually changed -- same reasoning
  // as checkDuplicate() above.
  if (!suggestion) {
    hideCasingConflict();
  } else if (
    els.casingConflictNotice.classList.contains('hidden') ||
    els.useCasingSuggestionBtn.textContent !== suggestion
  ) {
    showCasingSuggestion(suggestion);
  }
}

let casingCheckTimer = null;

function scheduleCasingCheck() {
  clearTimeout(casingCheckTimer);
  casingCheckTimer = setTimeout(() => {
    checkCompanyCasing(els.company.value.trim(), 'high');
  }, 600);
}

function casingCheckNow() {
  clearTimeout(casingCheckTimer);
  checkCompanyCasing(els.company.value.trim(), 'high');
}

function attachCasingCheckTriggers() {
  els.company.addEventListener('input', scheduleCasingCheck);
  els.company.addEventListener('blur', casingCheckNow);
}

function fillUrlIfEmpty(url) {
  if (!url) return;
  if (els.jobUrl.value.trim()) return;
  els.jobUrl.value = url;
}

// Auto-rescan (tab activation, tab update, window focus) fires on every
// one of those events even when the active tab hasn't actually changed --
// e.g. alt-tabbing back to the browser refires windows.onFocusChanged on
// the same tab/url. Without this, every one of those no-op events still
// hid and rebuilt all three notices above the form, which is most of
// what made the panel feel like it was flickering/sliding on its own.
// Tracking the last-scraped tab+url lets those no-op triggers skip the
// whole rebuild. Manual triggers (Rescan button, Clear) pass force=true
// to bypass this, since the user is explicitly asking for a fresh pull.
let lastScrapedTabId = null;
let lastScrapedUrl = null;

async function runScrape(force = false) {
  const tab = await getSourceTab();
  if (!tab || !tab.url) {
    els.scrapeNotice.classList.add('hidden');
    hideDuplicateNotice();
    hideCasingConflict();
    showScrapeNotice('No active tab detected. Enter details manually.', true);
    return;
  }

  if (!force && tab.id === lastScrapedTabId && tab.url === lastScrapedUrl) {
    return;
  }
  lastScrapedTabId = tab.id;
  lastScrapedUrl = tab.url;

  // scrapeNotice is deliberately NOT hidden here. Every branch below
  // ends by calling showScrapeNotice() with fresh text, so hiding it
  // first only matters on the branch with a real await in between (the
  // actual scrape + duplicate/casing checks) -- there, it collapsed the
  // box for a frame and re-expanded it once the new text was ready,
  // which is the flicker at the top on a no-scraper -> captured switch.
  // Leaving the old text in place until it's overwritten avoids that.
  // duplicateNotice/casingConflictNotice don't have that problem (see
  // checkDuplicate()/checkCompanyCasing() above), but still need
  // hiding here since not every branch below re-checks them.
  hideDuplicateNotice();
  hideCasingConflict();

  const site = detectSite(tab.url);
  if (!site) {
    // A genuinely different tab (the dedup check above already filtered
    // out same-tab refocus noise) that isn't one of the supported ATSes
    // -- most likely a company's own careers page. Reset the form
    // instead of leaving the previous tab's title/company sitting here
    // mislabeled as this one; same "trust the current tab" rule a
    // successful scrape already applies via populateForm() below.
    populateForm({ jobUrl: tab.url });
    showScrapeNotice(
      'No scraper for this site yet (Greenhouse, LinkedIn, Workday, Lever, Ashby so far). URL filled in, enter the rest manually.',
      true
    );
    await saveDraft();
    return;
  }

  let response;
  let reachable = true;
  try {
    response = await chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_JOB' });
  } catch (err) {
    // Most likely cause: this tab was already open before the extension
    // was loaded/reloaded. Chrome only auto-injects manifest-declared
    // content scripts on future navigations, not retroactively into
    // tabs that were already open -- so inject it on demand and retry
    // once instead of asking the user to reload the tab themselves.
    const injected = await injectContentScript(tab.id, site);
    if (injected) {
      try {
        response = await chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_JOB' });
      } catch (retryErr) {
        reachable = false;
      }
    } else {
      reachable = false;
    }
  }

  if (!reachable) {
    showScrapeNotice(
      'Page loaded before extension, reload page or enter details manually. URL filled in below.',
      true
    );
    fillUrlIfEmpty(tab.url);
    await saveDraft();
    return;
  }

  if (!response || !response.ok) {
    showScrapeNotice('Scrape failed on this page. URL filled in, enter the rest manually.', true);
    fillUrlIfEmpty(tab.url);
    await saveDraft();
    return;
  }

  populateForm(response);
  await saveDraft();
  await checkDuplicate(response.company, response.jobId);
  await checkCompanyCasing(response.company, response.confidence);
  if (response.confidence === 'high') {
    showScrapeNotice('Captured from page structured data.', false);
  } else {
    showScrapeNotice(
      'Captured from page: unverified, please confirm before saving.',
      true
    );
  }
}

els.rescanBtn.addEventListener('click', async () => {
  await runScrape(true);
  await saveDraft();
});

els.clearDraftBtn.addEventListener('click', async () => {
  await clearDraft();
  els.form.reset();
  els.jobId.value = '';
  els.createFiles.checked = true;
  els.resultMessage.classList.add('hidden');
  hideOutputs();
  await runScrape(true);
});

// ---- Generated outputs (excelRowText / starterPromptText) ---------------
// These come back from the API's POST response when createFiles was
// checked -- NOT regenerated here, since I don't have the actual
// generateOutputs.ts template logic to port and won't guess at it.
// If the API doesn't return these fields, we say so instead of silently
// showing nothing or making something up.

function showOutputs(excelRowText, starterPromptText) {
  const hasAnyContent = Boolean(
    (excelRowText && excelRowText.trim()) || (starterPromptText && starterPromptText.trim())
  );

  els.excelRowOutput.value = excelRowText || '';
  els.starterPromptOutput.value = starterPromptText || '';

  // Section only shows at all if there's something to copy -- no point
  // hiding/showing the two blocks independently when they always arrive
  // together in practice.
  els.outputsSection.classList.toggle('hidden', !hasAnyContent);
}

function hideOutputs() {
  els.outputsSection.classList.add('hidden');
  els.excelRowOutput.value = '';
  els.starterPromptOutput.value = '';
}

async function copyExact(text, btnEl) {
  // Copy the raw string value directly rather than selecting rendered
  // text -- selection-based copying can collapse whitespace/tabs, which
  // would break a tab-separated Excel row on paste. Clipboard API
  // preserves the string exactly as-is.
  let success = false;
  try {
    await navigator.clipboard.writeText(text);
    success = true;
  } catch (err) {
    // Fallback for contexts where the async Clipboard API is blocked:
    // select the *textarea's* value (still exact, unlike selecting
    // rendered page text) and use execCommand.
    const source = btnEl.dataset.target === 'excelRowOutput'
      ? els.excelRowOutput
      : els.starterPromptOutput;
    source.removeAttribute('disabled');
    source.select();
    try {
      success = document.execCommand('copy');
    } catch {
      success = false;
    }
    source.setSelectionRange(0, 0);
  }

  const original = btnEl.textContent;
  btnEl.textContent = success ? 'Copied!' : 'Copy failed';
  btnEl.classList.toggle('copied', success);
  setTimeout(() => {
    btnEl.textContent = original;
    btnEl.classList.remove('copied');
  }, 1500);
}

document.querySelectorAll('.copy-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const targetEl = document.getElementById(btn.dataset.target);
    copyExact(targetEl.value, btn);
  });
});

// ---- Fetching generated outputs after create -----------------------------
// The API doesn't return excelRowText/starterPromptText from the POST
// itself -- confirmed by the user, not assumed -- so we look the record
// back up via the list endpoint (the only GET we've been told exists)
// and find it by id. If a single-record GET endpoint exists this could
// be one direct fetch instead of pulling the whole list.

async function fetchCreatedRecord(apiBaseUrl, createdId) {
  const res = await fetch(`${apiBaseUrl}/api/job-applications`);
  if (!res.ok) {
    throw new Error(`List fetch failed (HTTP ${res.status})`);
  }
  const payload = await res.json().catch(() => null);
  const list = payload && payload.data;
  if (!Array.isArray(list)) {
    throw new Error('List response had no data array.');
  }
  return list.find((item) => item._id === createdId || item.id === createdId) || null;
}

// ---- Submit -----------------------------------------------------------

function showResult(text, kind) {
  els.resultMessage.textContent = text;
  els.resultMessage.className = `result-message ${kind}`;
}

els.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  els.resultMessage.classList.add('hidden');

  const apiBaseUrl = await getApiBaseUrl();
  if (!apiBaseUrl || !(await hasApiPermission(apiBaseUrl))) {
    showResult('Not connected to an API. Set it up in settings (⚙) first.', 'error');
    return;
  }

  const body = {
    company: els.company.value.trim(),
    jobId: els.jobId.value.trim(),
    jobTitle: els.jobTitle.value.trim(),
    jobUrl: els.jobUrl.value.trim(),
    createFiles: els.createFiles.checked,
  };

  els.submitBtn.disabled = true;
  els.submitBtn.textContent = 'Saving…';
  hideOutputs();

  try {
    const res = await fetch(`${apiBaseUrl}/api/job-applications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.status === 409) {
      showResult(
        `Already applied to ${body.company} / ${body.jobTitle || 'this role'}. This looks like a duplicate.`,
        'duplicate'
      );
    } else if (res.ok) {
      const payload = await res.json().catch(() => null);
      const created = payload && payload.data;
      const wantedFiles = els.createFiles.checked;

      if (wantedFiles && created) {
        const createdId = created._id || created.id;
        if (!createdId) {
          showResult(
            'Saved, but the response had no id to look the record back up by, so I can\'t fetch excelRowText/starterPromptText.',
            'error'
          );
          hideOutputs();
        } else {
          els.submitBtn.textContent = 'Fetching outputs…';
          try {
            const fullRecord = await fetchCreatedRecord(apiBaseUrl, createdId);
            const hasOutputs =
              fullRecord && (fullRecord.excelRowText || fullRecord.starterPromptText);
            if (hasOutputs) {
              showResult('Saved to your application tracker.', 'success');
              showOutputs(fullRecord.excelRowText, fullRecord.starterPromptText);
            } else {
              showResult(
                'Saved, but excelRowText/starterPromptText weren\'t on the record when I looked it back up. Might need a moment to generate, or come from somewhere else.',
                'error'
              );
              hideOutputs();
            }
          } catch (err) {
            showResult(
              `Saved, but couldn't look it back up for excelRowText/starterPromptText: ${err.message}`,
              'error'
            );
            hideOutputs();
          }
        }
      } else {
        showResult('Saved to your application tracker.', 'success');
        hideOutputs();
      }

      if (created) {
        await clearDraft();
        els.form.reset();
        els.jobId.value = '';
        els.createFiles.checked = true;
        hideDuplicateNotice();
        hideCasingConflict();
      }
    } else {
      const text = await res.text().catch(() => '');
      showResult(`Save failed (HTTP ${res.status}). ${text}`.trim(), 'error');
    }
  } catch (err) {
    showResult(
      `Could not reach the Mongo API at ${apiBaseUrl}. Is the server running?`,
      'error'
    );
  } finally {
    els.submitBtn.disabled = !connected;
    els.submitBtn.textContent = 'Save application';
  }
});

// ---- Auto-rescan on tab/window changes -----------------------------------
// The side panel stays open across tab switches (that's the whole point),
// but nothing was previously triggering a rescan when the active tab
// actually changed -- so it either kept showing the previous tab's data,
// or (for tabs that predate the extension load) failed outright. This
// listens for the three ways "what I'm looking at" can change and
// re-runs the scrape, reusing runScrape()'s injection-retry logic.

const autoRescanDebounced = debounce(() => {
  runScrape();
}, 400);

function attachAutoRescan() {
  chrome.tabs.onActivated.addListener(() => {
    autoRescanDebounced();
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.active) {
      autoRescanDebounced();
    }
  });

  chrome.windows.onFocusChanged.addListener((windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) return;
    autoRescanDebounced();
  });
}

// ---- Init ---------------------------------------------------------------

(async function init() {
  const apiBaseUrl = await getApiBaseUrl();
  if (apiBaseUrl) {
    els.apiBaseUrlInput.value = apiBaseUrl;
    connected = await hasApiPermission(apiBaseUrl);
    if (connected) {
      els.connectionStatus.textContent = `Connected to ${apiBaseUrl}`;
    } else {
      els.connectionStatus.textContent = 'Saved, but permission not granted. Click Connect.';
      els.notConnectedNotice.classList.remove('hidden');
      els.settingsPanel.classList.remove('hidden');
    }
  } else {
    els.notConnectedNotice.classList.remove('hidden');
    els.settingsPanel.classList.remove('hidden');
  }
  updateSubmitEnabled();

  const draft = await loadDraft();
  const hasDraftContent =
    draft && (draft.jobTitle || draft.company || draft.jobUrl || draft.jobId);

  if (hasDraftContent) {
    populateForm(draft);
    els.createFiles.checked = draft.createFiles !== false;
    await checkDuplicate(draft.company, draft.jobId);
    showScrapeNotice(
      'Restored your unsaved draft. Click "Rescan page" to pull fresh data instead, or "Clear" to start over.',
      true
    );
  } else {
    await runScrape();
  }

  attachDraftAutosave();
  attachAutoRescan();
  attachDuplicateCheckTriggers();
  attachCasingCheckTriggers();
})();
