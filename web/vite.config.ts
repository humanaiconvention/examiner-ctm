import { defineConfig, type PluginOption } from 'vite'
import path from 'node:path'
import fs from 'node:fs'
import { execSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

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

// SRI injection plugin: reads dist/sri-manifest.json after build generate step (assumes script run pre-build or via hook)
function sriInjectPlugin(): PluginOption {
  return {
    name: 'sri-inject',
    enforce: 'post',
    transformIndexHtml(html) {
      // We only inject during build
      if (process.env.NODE_ENV !== 'production') return html;
      try {
        const manifestPath = path.resolve(__dirname, 'dist', 'sri-manifest.json');
        if (!fs.existsSync(manifestPath)) return html;
        const data = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as { files: Record<string,string> };
        // Replace matching <script type="module" src="..."> and <link rel="stylesheet" href="...">
        return html.replace(/<script([^>]*?)src="([^"]+)"([^>]*)><\/script>/g, (full, pre, src, post) => {
          const integrity = data.files[src.replace(/^\//,'').replace(/^\.\//,'')];
          if (!integrity || /integrity=/.test(full)) return full;
            return `<script${pre}src="${src}" integrity="${integrity}" crossorigin="anonymous"${post}></script>`;
        }).replace(/<link([^>]*?)href="([^"]+)"([^>]*?)>/g, (full, pre, href, post) => {
          if (!/rel=["']stylesheet["']/.test(full)) return full;
          const integrity = data.files[href.replace(/^\//,'').replace(/^\.\//,'')];
          if (!integrity || /integrity=/.test(full)) return full;
          return `<link${pre}href="${href}" integrity="${integrity}" crossorigin="anonymous"${post}>`;
        });
      } catch (e) {
        console.warn('[sri-inject] failed', e);
        return html;
      }
    }
  };
}

const analyzerPlugin = visualizer({ filename: 'dist/analysis/stats.html', gzipSize: true, brotliSize: true }) as unknown as PluginOption;

export default defineConfig(({ mode }) => {
  const plugins: PluginOption[] = [react(), inlineVersionPlugin(), sriInjectPlugin()];
  if (mode === 'analyze') plugins.push(analyzerPlugin);
  let commit = 'dev';
  try {
    commit = execSync('git rev-parse --short HEAD').toString().trim();
  } catch { /* fallback */ }
  const buildStamp = Date.now().toString(36);
  return {
    plugins,
    base,
    define: {
      'self.BUILD_REV': JSON.stringify(`${commit}.${buildStamp}`)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'analytics-core': [ 'src/analytics/core.ts' ],
            'analytics-engagement': [ 'src/analytics/engagement.ts' ],
            'analytics-perf': [ 'src/analytics/perf.ts' ],
            'analytics-errors': [ 'src/analytics/errors.ts' ],
          }
        }
      }
    },
  };
});
