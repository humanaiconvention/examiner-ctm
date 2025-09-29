import { defineConfig } from 'vite'
import path from 'node:path'
import fs from 'node:fs'
import react from '@vitejs/plugin-react'

// Derive base path for GitHub Pages or custom domain deployments.
// PUBLIC_BASE_PATH is set in the deploy workflow:
// - '/' when custom CNAME (root)
// - '/<repo>' for default GitHub Pages project site
// Normalize to ensure leading slash and no trailing slash (except root)
function normalizeBase(input?: string) {
  if (!input || input === '/') return '/'
  let b = input.trim()
  if (!b.startsWith('/')) b = '/' + b
  if (b.endsWith('/')) b = b.slice(0, -1)
  return b
}
const base = normalizeBase(process.env.PUBLIC_BASE_PATH)

// Inline version plugin: reads generated public/version.json (ensure version:gen ran before build)
// buildTime intentionally omitted from version.json for deterministic hashing of index.html
function inlineVersionPlugin() {
  return {
    name: 'inline-version-meta',
    transformIndexHtml(html: string) {
      try {
        const versionPath = path.resolve(__dirname, 'public', 'version.json')
        if (fs.existsSync(versionPath)) {
          const json = JSON.parse(fs.readFileSync(versionPath, 'utf8'))
          const metaTag = `<meta name="x-app-version" content="${json.version}+${json.commit || ''}">`
          return html.replace(/<meta name="x-app-version"[^>]*>/, metaTag)
            .replace(/window.__APP_VERSION__\s*=\s*undefined;?/, `window.__APP_VERSION__ = ${JSON.stringify(json)};`)
        }
      } catch (e) {
        console.warn('[inline-version] Failed to inline version:', e)
      }
      return html
    }
  }
}

export default defineConfig({
  plugins: [react(), inlineVersionPlugin()],
  base,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
