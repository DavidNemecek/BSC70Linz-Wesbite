import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig({
  // Must be an absolute root path, not a relative './' — with a relative
  // base, nested routes like /anfahrt/:hall resolve the built asset URLs
  // relative to their own path (e.g. /anfahrt/assets/...) instead of the
  // site root, and the SPA catch-all rewrite then serves index.html for
  // that broken asset URL instead of the real JS/CSS, leaving a blank page.
  base: '/',
  plugins: [inspectAttr(), react()],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
