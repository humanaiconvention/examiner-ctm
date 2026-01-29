// Preview gate module (non-secure). Controlled by VITE_ENABLE_PREVIEW_GATE.
// Modes:
//  - Plain phrase (VITE_PREVIEW_PASSWORD)
//  - SHA-256 hash (VITE_ACCESS_PASSWORD_HASH) to avoid shipping phrase directly (still bypassable client-side).
// Disable with VITE_ENABLE_PREVIEW_GATE=false before public launch.

const enabled = import.meta.env.VITE_ENABLE_PREVIEW_GATE === 'true'

// Fallback phrase if none provided
const PHRASE: string = (import.meta as ImportMeta).env?.VITE_PREVIEW_PASSWORD || 'haslam'
const HASH: string | undefined = (import.meta as ImportMeta).env?.VITE_ACCESS_PASSWORD_HASH
if (enabled) {
  const KEY = 'hac_preview_unlocked_v1'
  let already = false
  try { already = localStorage.getItem(KEY) === '1' } catch { /* ignore */ }
  if (!already) injectGate()
}

function injectGate() {
  const root = document.getElementById('root')
  if (root) {
    root.style.visibility = 'hidden'
  }
  const wrapper = document.createElement('div')
  wrapper.id = 'access-gate'
  wrapper.style.cssText = [
    'position:fixed',
    'inset:0',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
    'background:#0d0f11',
    'color:#f5f7fa',
    'z-index:9999'
  ].join(';')

  wrapper.innerHTML = `
    <form id="gate-form" style="background:#161a1d;padding:2.5rem 2.75rem;border:1px solid #2a2f35;max-width:380px;width:100%;border-radius:14px;box-shadow:0 4px 24px -4px rgba(0,0,0,.55);">
      <h1 style="margin:0 0 0.75rem;font-size:1.35rem;font-weight:600;letter-spacing:.5px;">Private Preview</h1>
      <p style="margin:0 0 1.5rem;font-size:.9rem;line-height:1.4;color:#b7c0c9;">Enter access phrase to continue.</p>
      <label style="display:block;margin-bottom:.75rem;">
        <span style="display:block;font-size:.7rem;text-transform:uppercase;letter-spacing:1px;margin:0 0 .4rem;color:#8a949e;font-weight:600;">Access Phrase</span>
        <input id="gate-input" type="password" autocomplete="off" spellcheck="false" style="width:100%;padding:.75rem .85rem;border:1px solid #3a424a;background:#1d2226;color:#f5f7fa;border-radius:8px;font-size:.95rem;outline:none;" />
      </label>
      <button type="submit" style="width:100%;background:#3b82f6;border:none;color:#fff;padding:.8rem 1rem;font-size:.95rem;font-weight:600;border-radius:8px;cursor:pointer;">Enter</button>
      <div id="gate-error" style="display:none;color:#ef4444;font-size:.75rem;margin-top:.75rem;">Incorrect phrase. Try again.</div>
      <div style="margin-top:1.25rem;font-size:.6rem;letter-spacing:.6px;text-transform:uppercase;color:#586069;">TEMPORARY • DO NOT SHARE WIDELY</div>
    </form>`

  document.body.appendChild(wrapper)

  const form = wrapper.querySelector<HTMLFormElement>('#gate-form')!
  const input = wrapper.querySelector<HTMLInputElement>('#gate-input')!
  const errorEl = wrapper.querySelector<HTMLDivElement>('#gate-error')!

  requestAnimationFrame(() => input.focus())

  form.addEventListener('submit', e => {
    e.preventDefault()
    const raw = input.value
    validateAccess(raw).then(ok => {
      if (ok) {
        try { localStorage.setItem('hac_preview_unlocked_v1', '1') } catch {/* ignore quota */}
        wrapper.style.opacity = '1'
        wrapper.style.transition = 'opacity .4s ease'
        requestAnimationFrame(() => { wrapper.style.opacity = '0' })
        setTimeout(() => {
          wrapper.remove()
          if (root) root.style.visibility = 'visible'
        }, 420)
      } else {
        errorEl.style.display = 'block'
        input.focus()
        input.select()
      }
    })
  })
}

async function validateAccess(entered: string): Promise<boolean> {
  const trimmed = entered.trim()
  if (HASH) {
    try {
      const encoder = new TextEncoder()
      const digest = await crypto.subtle.digest('SHA-256', encoder.encode(trimmed))
      const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
      return timingSafeEqual(hex, HASH.toLowerCase())
    } catch {
      // fall back to phrase mode if hashing fails
    }
  }
  return trimmed.toLowerCase() === PHRASE.toLowerCase()
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
