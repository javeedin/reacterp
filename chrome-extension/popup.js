document.getElementById('openPanel').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' });
  window.close();
});
