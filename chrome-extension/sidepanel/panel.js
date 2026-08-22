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
  return null;
}

const CONTENT_SCRIPT_BY_SITE = {
  greenhouse: 'content-scripts/greenhouse.js',
  linkedin: 'content-scripts/linkedin.js',
  workday: 'content-scripts/workday.js',
  lever: 'content-scripts/lever.js',
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

function showDuplicateNotice(data) {
  const appliedDate = data.createdAt
    ? new Date(data.createdAt).toLocaleDateString()
    : null;
  const statusText = data.endedAt
    ? `${data.status} (ended ${new Date(data.endedAt).toLocaleDateString()})`
    : data.status;
  els.duplicateNotice.textContent = appliedDate
    ? `Already applied: ${statusText}, applied ${appliedDate}.`
    : `Already applied: ${statusText}.`;
  els.duplicateNotice.classList.remove('hidden');
}

function hideDuplicateNotice() {
  els.duplicateNotice.classList.add('hidden');
  els.duplicateNotice.textContent = '';
}

async function checkDuplicate(company, jobId) {
  hideDuplicateNotice();
  if (!company || !jobId) return;

  const apiBaseUrl = await getApiBaseUrl();
  if (!apiBaseUrl || !(await hasApiPermission(apiBaseUrl))) return;

  try {
    const url =
      `${apiBaseUrl}/api/job-applications/check` +
      `?company=${encodeURIComponent(company)}&jobId=${encodeURIComponent(jobId)}`;
    const res = await fetch(url);
    if (!res.ok) return;
    const payload = await res.json().catch(() => null);
    if (payload && payload.ok && payload.exists && payload.data) {
      showDuplicateNotice(payload.data);
    }
  } catch (err) {
    // API unreachable -- say nothing rather than guess.
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

function fillUrlIfEmpty(url) {
  if (!url) return;
  if (els.jobUrl.value.trim()) return;
  els.jobUrl.value = url;
}

async function runScrape() {
  els.scrapeNotice.classList.add('hidden');
  hideDuplicateNotice();
  const tab = await getSourceTab();
  if (!tab || !tab.url) {
    showScrapeNotice('No active tab detected. Enter details manually.', true);
    return;
  }

  const site = detectSite(tab.url);
  if (!site) {
    showScrapeNotice(
      'No scraper for this site yet (Greenhouse, LinkedIn, Workday, Lever so far). URL filled in, enter the rest manually.',
      true
    );
    fillUrlIfEmpty(tab.url);
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
  await runScrape();
  await saveDraft();
});

els.clearDraftBtn.addEventListener('click', async () => {
  await clearDraft();
  els.form.reset();
  els.jobId.value = '';
  els.createFiles.checked = true;
  els.resultMessage.classList.add('hidden');
  hideOutputs();
  await runScrape();
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
})();
