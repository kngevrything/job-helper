// Docks the extension's UI to Chrome's side panel instead of Chrome's
// default anchored extension window (which closes the instant it loses
// focus) or a detached window (which stays open but is easy to lose
// behind other windows). setPanelBehavior({ openPanelOnActionClick: true })
// makes clicking the toolbar icon open/focus the panel directly — per
// Chrome's docs, you should NOT also add an action.onClicked listener
// when this is enabled, since the side panel API handles the click
// itself.

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error('Failed to set side panel behavior:', err));
});
