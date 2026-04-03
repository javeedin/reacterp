// ── Side Panel Script ──────────────────────────────────────────────────────────

// ── State ─────────────────────────────────────────────────────────────────────
let steps       = [];
let recording   = false;
let elapsed     = 0;
let timerHandle = null;
let hasPassword = false;
let isSetup     = false;   // true = creating password for the first time

// ── Helpers ───────────────────────────────────────────────────────────────────
async function sha256(str) {
  const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}
const formatTime = (s) => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;

function el(id) { return document.getElementById(id); }

// ── Password system ───────────────────────────────────────────────────────────
async function initAuth() {
  const { pwHash } = await chrome.storage.local.get('pwHash');
  hasPassword = !!pwHash;

  if (!hasPassword) {
    // First time — set up a new password
    isSetup = true;
    el('lockTitle').textContent     = 'Set Your Password';
    el('lockDesc').textContent      = 'Create a password to protect your recordings';
    el('pwLabel').textContent       = 'New Password';
    el('pwBtn').textContent         = 'Set Password & Continue';
    el('pwConfirmGroup').classList.remove('hidden');
    el('forgotLink').style.display  = 'none';
  } else {
    // Returning user
    isSetup = false;
    el('lockTitle').textContent    = 'Unlock Recorder';
    el('lockDesc').textContent     = 'Enter your password to continue';
    el('pwBtn').textContent        = 'Unlock';
    el('pwConfirmGroup').classList.add('hidden');
    el('forgotLink').style.display = 'block';
  }
}

el('pwBtn').addEventListener('click', async () => {
  const pw = el('pwInput').value.trim();
  if (!pw) return;
  el('pwErr').style.display = 'none';

  if (isSetup) {
    const confirm = el('pwConfirm').value.trim();
    if (pw !== confirm) { el('pwErr').textContent = 'Passwords do not match'; el('pwErr').style.display = 'block'; return; }
    const hash = await sha256(pw);
    await chrome.storage.local.set({ pwHash: hash });
    unlock();
  } else {
    const { pwHash } = await chrome.storage.local.get('pwHash');
    const hash = await sha256(pw);
    if (hash !== pwHash) { el('pwErr').textContent = 'Incorrect password'; el('pwErr').style.display = 'block'; return; }
    unlock();
  }
});

el('pwInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') el('pwBtn').click(); });
el('pwConfirm').addEventListener('keydown', (e) => { if (e.key === 'Enter') el('pwBtn').click(); });

el('forgotLink').addEventListener('click', async () => {
  if (!confirm('Reset password? This will delete all saved steps but keep your recordings.')) return;
  await chrome.storage.local.remove(['pwHash', 'steps']);
  await initAuth();
});

function unlock() {
  el('lockScreen').style.display = 'none';
  el('mainScreen').classList.remove('hidden');
  el('pwInput').value = '';
  el('pwConfirm').value = '';
  loadSteps();
}

el('lockBtn').addEventListener('click', () => {
  el('mainScreen').classList.add('hidden');
  el('lockScreen').style.display = '';
  el('pwInput').value = '';
  initAuth();
});

// ── Persist steps ─────────────────────────────────────────────────────────────
async function loadSteps() {
  const data = await chrome.storage.session.get('steps');
  steps = data.steps || [];
  renderSteps();
}
async function saveSteps() {
  await chrome.storage.session.set({ steps });
}

// ── Recording ─────────────────────────────────────────────────────────────────
el('recBtn').addEventListener('click', async () => {
  if (!recording) {
    await startRecording();
  } else {
    stopRecording();
  }
});

async function startRecording() {
  recording = true;
  elapsed   = 0;
  el('recBtn').textContent = '⏹ Stop';
  el('recBtn').style.background = '#333';
  el('recDot').classList.add('active');
  el('addStepBtn').disabled  = false;
  el('sessionInfo').classList.add('visible');
  el('headerBadge').textContent = '⏺ REC';

  timerHandle = setInterval(() => {
    elapsed++;
    el('timer').textContent = formatTime(elapsed);
  }, 1000);

  // Tell content scripts to start tracking
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]) {
    chrome.tabs.sendMessage(tabs[0].id, { type: 'START_TRACKING' }).catch(() => {});
  }

  // Capture first step (starting page)
  setTimeout(async () => {
    const tabInfo = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_TAB_INFO' });
    addStep({ description: `Start: ${tabInfo.title}`, url: tabInfo.url, pageTitle: tabInfo.title, screenshot: null, timestamp: Date.now() });
  }, 500);
}

function stopRecording() {
  recording = false;
  clearInterval(timerHandle);
  el('recBtn').textContent = '⏺ Start';
  el('recBtn').style.background = '';
  el('recDot').classList.remove('active');
  el('addStepBtn').disabled = true;
  el('headerBadge').textContent = `${steps.length} steps`;

  // Tell content scripts to stop tracking
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: 'STOP_TRACKING' }).catch(() => {});
  });

  el('genManualBtn').disabled = steps.length === 0;
  el('genUatBtn').disabled    = steps.length === 0;
}

// ── Steps ─────────────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'NEW_STEP' && recording) {
    addStep(msg.payload);
  }
});

function addStep(step) {
  steps.push({ ...step, id: Date.now() + Math.random() });
  saveSteps();
  renderSteps();
}

function renderSteps() {
  el('stepCount').textContent = steps.length;
  const list = el('stepsList');

  if (steps.length === 0) {
    list.innerHTML = '<p style="color:#999;font-size:12px;text-align:center;margin-top:24px">Start recording, then navigate your application.<br>Steps are captured automatically.</p>';
    return;
  }

  list.innerHTML = steps.map((s, i) => `
    <div class="step-card" data-id="${s.id}">
      <div class="step-body">
        <span class="step-num">${i + 1}</span>
        <span class="step-desc">${escHtml(s.description)}</span>
        <div class="step-url">${escHtml(s.url || '')}</div>
      </div>
      ${s.screenshot ? `<img class="step-shot" src="${s.screenshot}" />` : ''}
      <div class="step-actions">
        <button onclick="editStep('${s.id}')">✏ Edit</button>
        <button onclick="deleteStep('${s.id}')">🗑 Delete</button>
      </div>
    </div>
  `).join('');

  // Auto-scroll to bottom
  list.scrollTop = list.scrollHeight;
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

window.deleteStep = (id) => {
  steps = steps.filter(s => String(s.id) !== String(id));
  saveSteps();
  renderSteps();
};

window.editStep = (id) => {
  const step = steps.find(s => String(s.id) === String(id));
  if (!step) return;
  const newDesc = prompt('Edit step description:', step.description);
  if (newDesc !== null) { step.description = newDesc; saveSteps(); renderSteps(); }
};

el('addStepBtn').addEventListener('click', async () => {
  const desc     = prompt('Enter step description:');
  if (!desc) return;
  const shot     = await chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT' });
  const tabInfo  = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_TAB_INFO' });
  addStep({ description: desc, url: tabInfo.url, pageTitle: tabInfo.title, screenshot: shot?.dataUrl || null, timestamp: Date.now() });
});

el('clearBtn').addEventListener('click', () => {
  if (!steps.length || confirm('Clear all steps?')) { steps = []; saveSteps(); renderSteps(); el('genManualBtn').disabled = true; el('genUatBtn').disabled = true; }
});

// ── Generate User Manual (HTML) ───────────────────────────────────────────────
el('genManualBtn').addEventListener('click', () => generateManual());
el('genUatBtn').addEventListener('click', () => generateUAT());

function getSessionMeta() {
  return {
    title:    el('sessionTitle').value.trim() || 'Screen Recording',
    category: el('sessionCat').value || 'General',
    date:     new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
    steps:    steps.length,
    duration: formatTime(elapsed),
  };
}

function generateManual() {
  const meta = getSessionMeta();
  const stepRows = steps.map((s, i) => `
    <tr>
      <td class="num">${i + 1}</td>
      <td class="action">
        <strong>${escHtml(s.description)}</strong>
        ${s.url ? `<br><span class="url">${escHtml(s.url)}</span>` : ''}
      </td>
      <td class="shot">
        ${s.screenshot ? `<img src="${s.screenshot}" style="max-width:280px;border:1px solid #e0e0e0;border-radius:4px;" />` : '<span style="color:#bbb">—</span>'}
      </td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${escHtml(meta.title)} — User Manual</title>
<style>
  body { font-family: Segoe UI, Arial, sans-serif; margin: 0; padding: 0; color: #1a1a1a; }
  .cover { background: #C74634; color: #fff; padding: 40px 48px; }
  .cover h1 { margin: 0 0 8px; font-size: 28px; }
  .cover .sub { font-size: 14px; opacity: 0.85; }
  .meta { display: flex; gap: 32px; margin-top: 24px; font-size: 13px; }
  .meta span { opacity: 0.8; }
  .body { padding: 32px 48px; }
  .body h2 { font-size: 18px; color: #C74634; border-bottom: 2px solid #C74634; padding-bottom: 6px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { background: #C74634; color: #fff; padding: 10px 14px; text-align: left; }
  td { padding: 12px 14px; border-bottom: 1px solid #e5e5e5; vertical-align: top; }
  td.num { width: 36px; font-weight: 700; font-size: 15px; color: #C74634; }
  td.shot { width: 300px; }
  td.action .url { font-size: 11px; color: #888; margin-top: 4px; display: block; word-break: break-all; }
  tr:hover td { background: #fff8f6; }
  .footer { text-align: center; padding: 24px; color: #999; font-size: 11px; border-top: 1px solid #e5e5e5; }
</style>
</head>
<body>
<div class="cover">
  <h1>${escHtml(meta.title)}</h1>
  <div class="sub">${escHtml(meta.category)} — User Manual</div>
  <div class="meta">
    <span>📅 ${meta.date}</span>
    <span>📋 ${meta.steps} steps</span>
    <span>⏱ ${meta.duration}</span>
  </div>
</div>
<div class="body">
  <h2>Step-by-Step Instructions</h2>
  <table>
    <thead><tr><th>#</th><th>Action</th><th>Screenshot</th></tr></thead>
    <tbody>${stepRows}</tbody>
  </table>
</div>
<div class="footer">Generated by ReactERP Recorder · ${new Date().toLocaleString()}</div>
</body>
</html>`;

  downloadFile(`${slugify(meta.title)}_UserManual.html`, html, 'text/html');
}

// ── Generate UAT Script (HTML) ────────────────────────────────────────────────
function generateUAT() {
  const meta = getSessionMeta();
  const stepRows = steps.map((s, i) => `
    <tr>
      <td class="num">${i + 1}</td>
      <td>${escHtml(s.description)}</td>
      <td>${s.url ? `<span class="url">${escHtml(s.url.replace(/\?.*/, ''))}</span>` : '—'}</td>
      <td><em style="color:#888">Verify action completes successfully</em></td>
      <td style="text-align:center">
        <input type="radio" name="r${i}" value="pass"> Pass &nbsp;
        <input type="radio" name="r${i}" value="fail"> Fail
      </td>
      <td><input type="text" placeholder="Notes..." style="width:120px;padding:3px;border:1px solid #ddd;border-radius:3px;font-size:11px" /></td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${escHtml(meta.title)} — UAT Script</title>
<style>
  body { font-family: Segoe UI, Arial, sans-serif; margin: 0; padding: 0; color: #1a1a1a; }
  .cover { background: #0572CE; color: #fff; padding: 32px 48px; }
  .cover h1 { margin: 0 0 6px; font-size: 24px; }
  .cover .sub { font-size: 13px; opacity: 0.85; }
  .meta { display: flex; gap: 24px; margin-top: 16px; font-size: 12px; opacity: 0.85; }
  .info { padding: 16px 48px; background: #f0f7ff; display: flex; gap: 32px; font-size: 13px; }
  .info label { font-weight: 600; }
  .info input { border: none; border-bottom: 1px solid #aaa; background: transparent; width: 180px; font-size: 13px; padding: 2px; }
  .body { padding: 24px 48px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #0572CE; color: #fff; padding: 9px 12px; text-align: left; font-size: 12px; }
  td { padding: 10px 12px; border-bottom: 1px solid #e5e5e5; vertical-align: top; }
  td.num { width: 28px; font-weight: 700; color: #0572CE; }
  td .url { font-size: 10px; color: #888; }
  tr:nth-child(even) td { background: #f8fbff; }
  .sig { padding: 24px 48px; display: flex; gap: 48px; }
  .sig-block { flex: 1; border-top: 1px solid #333; padding-top: 8px; font-size: 12px; color: #666; }
  .footer { text-align: center; padding: 16px; color: #999; font-size: 11px; border-top: 1px solid #e5e5e5; }
  @media print { .cover, th { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="cover">
  <h1>${escHtml(meta.title)}</h1>
  <div class="sub">User Acceptance Testing (UAT) Script · ${escHtml(meta.category)}</div>
  <div class="meta"><span>📅 ${meta.date}</span><span>📋 ${meta.steps} test steps</span></div>
</div>
<div class="info">
  <div><label>Tester: </label><input type="text" placeholder="Name" /></div>
  <div><label>Test Date: </label><input type="date" /></div>
  <div><label>Environment: </label><input type="text" placeholder="e.g. UAT / Production" /></div>
  <div><label>Build/Version: </label><input type="text" placeholder="e.g. v1.0.2" /></div>
</div>
<div class="body">
  <table>
    <thead><tr><th>#</th><th>Test Step</th><th>Screen/URL</th><th>Expected Result</th><th>Pass / Fail</th><th>Notes</th></tr></thead>
    <tbody>${stepRows}</tbody>
  </table>
</div>
<div class="sig">
  <div class="sig-block">Tester Signature</div>
  <div class="sig-block">Reviewer Signature</div>
  <div class="sig-block">Sign-Off Date</div>
</div>
<div class="footer">Generated by ReactERP Recorder · ${new Date().toLocaleString()}</div>
</body>
</html>`;

  downloadFile(`${slugify(meta.title)}_UAT_Script.html`, html, 'text/html');
}

function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function slugify(str) {
  return str.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 50) || 'recording';
}

// ── Boot ──────────────────────────────────────────────────────────────────────
initAuth();
