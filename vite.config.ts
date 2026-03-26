import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(() => {
  // Read SMTP config from gitignored electron/email.config.json
  let emailCfg: { user?: string; pass?: string } = {};
  try {
    const cfgPath = path.join(__dirname, 'electron', 'email.config.json');
    emailCfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  } catch (_) { /* file not present — email will be disabled */ }

  return {
    plugins: [react()],
    base: process.env.GITHUB_ACTIONS ? '/reacterp/' : './',
    define: {
      __BREVO_API_KEY__: JSON.stringify(emailCfg.pass || ''),
      __BREVO_SENDER__:  JSON.stringify(emailCfg.user || ''),
    },
  };
});
