import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Use /reacterp/ for GitHub Pages, ./ for Electron/local
  base: process.env.VITE_BASE_URL || './',
})
