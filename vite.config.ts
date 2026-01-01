import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react()],
  // Use /reacterp/ for GitHub Pages (production), ./ for Electron/local
  base: process.env.GITHUB_ACTIONS ? '/reacterp/' : './',
}))
