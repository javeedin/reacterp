// ── Background Service Worker ─────────────────────────────────────────────────
// Handles: screenshot capture, step storage, side panel opening

// Open side panel when toolbar icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
});

// Take a screenshot of the active tab and return base64 PNG
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'CAPTURE_SCREENSHOT') {
    chrome.tabs.captureVisibleTab(null, { format: 'png', quality: 80 }, (dataUrl) => {
      sendResponse({ dataUrl: dataUrl || null });
    });
    return true; // keep channel open for async response
  }

  if (msg.type === 'GET_ACTIVE_TAB_INFO') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      sendResponse({ url: tab?.url || '', title: tab?.title || '' });
    });
    return true;
  }

  if (msg.type === 'OPEN_SIDE_PANEL') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs[0]) {
        await chrome.sidePanel.open({ tabId: tabs[0].id });
      }
      sendResponse({ ok: true });
    });
    return true;
  }
});
