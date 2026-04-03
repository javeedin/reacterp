// ── Content Script — injected into every page ─────────────────────────────────
// Tracks: clicks, inputs, form submits, URL changes → sends steps to side panel

let tracking = false;

// Listen for commands from side panel / background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'START_TRACKING') tracking = true;
  if (msg.type === 'STOP_TRACKING')  tracking = false;
});

// Describe an element in human-readable terms
function describeElement(el) {
  if (!el) return 'Unknown element';

  const tag  = el.tagName?.toLowerCase() || '';
  const text = (el.innerText || el.textContent || '').trim().slice(0, 80);
  const label = el.getAttribute('aria-label') || el.getAttribute('title') || '';
  const placeholder = el.getAttribute('placeholder') || '';
  const name  = el.getAttribute('name') || el.getAttribute('id') || '';
  const type  = el.getAttribute('type') || '';
  const role  = el.getAttribute('role') || '';

  // Find associated <label> element
  let assocLabel = '';
  if (name) {
    const lbl = document.querySelector(`label[for="${name}"]`);
    if (lbl) assocLabel = lbl.innerText?.trim().slice(0, 60) || '';
  }

  if (tag === 'button' || role === 'button')  return `Click button: "${label || text}"`;
  if (tag === 'a')                            return `Click link: "${label || text}"`;
  if (tag === 'input' && type === 'submit')   return `Click button: "${label || el.value || 'Submit'}"`;
  if (tag === 'input' && type === 'checkbox') return `${el.checked ? 'Check' : 'Uncheck'} checkbox: "${assocLabel || label || name}"`;
  if (tag === 'input' || tag === 'textarea')  return `Enter text in "${assocLabel || label || placeholder || name}"`;
  if (tag === 'select')                       return `Select value in "${assocLabel || label || name}"`;
  if (tag === 'li' && role === 'option')      return `Select option: "${label || text}"`;
  if (text)                                   return `Click: "${text}"`;
  return `Click ${tag}${label ? ': "' + label + '"' : ''}`;
}

// Send a step to the side panel
async function captureStep(description, extraInfo = '') {
  if (!tracking) return;
  try {
    const screenshot = await chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT' });
    chrome.runtime.sendMessage({
      type: 'NEW_STEP',
      payload: {
        description,
        extraInfo,
        url:       window.location.href,
        pageTitle: document.title,
        timestamp: Date.now(),
        screenshot: screenshot?.dataUrl || null,
      },
    });
  } catch (_) {}
}

// Click tracker — debounced to avoid duplicate steps for same click
let lastClick = 0;
document.addEventListener('click', (e) => {
  if (!tracking) return;
  const now = Date.now();
  if (now - lastClick < 400) return;
  lastClick = now;

  const el     = e.target;
  const desc   = describeElement(el);
  const ignore = ['html','body','div','span','td','tr','th','table'].includes(el.tagName?.toLowerCase());
  if (!ignore || el.getAttribute('role') || el.onclick) {
    setTimeout(() => captureStep(desc), 300); // slight delay so page reacts first
  }
}, true);

// Input / select change tracker
document.addEventListener('change', (e) => {
  if (!tracking) return;
  const el  = e.target;
  const tag = el.tagName?.toLowerCase();
  if (tag === 'select') {
    const selectedText = el.options[el.selectedIndex]?.text || el.value;
    const desc = describeElement(el).replace('Select value in', 'Selected') + ` = "${selectedText}"`;
    setTimeout(() => captureStep(desc), 300);
  }
}, true);

// Navigation change (SPA routing)
let lastUrl = location.href;
const navObserver = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    setTimeout(() => captureStep(`Navigate to: ${document.title}`, window.location.href), 600);
  }
});
navObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
