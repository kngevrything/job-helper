// Docks the extension's UI to Chrome's side panel instead of a detached
// popup window: it stays attached to the browser window as you switch
// tabs, and doesn't get lost among other windows the way a standalone
// window can. setPanelBehavior({ openPanelOnActionClick: true }) makes
// clicking the toolbar icon open/focus the panel directly — per Chrome's
// docs, you should NOT also add an action.onClicked listener when this
// is enabled, since the side panel API handles the click itself.

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error('Failed to set side panel behavior:', err));
});
