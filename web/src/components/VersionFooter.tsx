import { useEffect, useState } from 'react'

interface AppVersionInfo {
  name: string
  version: string
  commit: string
  fullCommit?: string
  buildTime: string
}

function readWindowVersion(): AppVersionInfo | undefined {
  if (typeof window === 'undefined') return undefined
  return window.__APP_VERSION__
}

export function VersionFooter() {
  const [info, setInfo] = useState<AppVersionInfo | undefined>(() => readWindowVersion())

  useEffect(() => {
    if (!info) {
      // Attempt fetch fallback if not injected yet
      fetch('/version.json')
        .then((r) => (r.ok ? r.json() : undefined))
        .then((data) => {
          if (data && !info) setInfo(data)
        })
        .catch(() => {})
    }
  }, [info])

  if (!info) return null
  const short = info.commit?.slice(0, 7) || 'unknown'
  return (
    <div className="version-footer" aria-label="Application build information">
      <span>v{info.version}</span>
      <span>·</span>
      <span>{short}</span>
      <span style={{ opacity: 0.6 }}>· built {new Date(info.buildTime).toLocaleString()}</span>
    </div>
  )
}

export default VersionFooter
