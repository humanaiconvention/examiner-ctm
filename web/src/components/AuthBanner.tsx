import { useSession } from '../hooks/useSession';

/**
 * AuthBanner – lightweight owner auth status surface.
 * Shows authenticated email + logout control (non-invasive banner).
 * Intentionally minimal to keep bundle cost trivial (< 0.3 KB gz expected).
 */
export default function AuthBanner() {
  const { authenticated, email, loading } = useSession();
  if (loading) return null; // avoid layout shift
  if (!authenticated) return null;
  return (
    <div
      className="auth-banner"
      role="status"
      aria-label="Authenticated as owner"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        background: 'rgba(20,25,30,0.85)',
        color: '#fff',
        padding: '4px 10px',
        fontSize: '12px',
        lineHeight: 1.4,
        fontFamily: 'system-ui, sans-serif',
        borderBottomLeftRadius: '6px',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        boxShadow: '0 2px 6px rgba(0,0,0,0.35)'
      }}
    >
      <span style={{ opacity: 0.9 }}>Owner: {email || 'unknown'}</span>{' '}
      <a
        href="/logout"
        style={{ color: '#90d5ff', textDecoration: 'underline', marginLeft: 8 }}
        onClick={(e) => {
          e.preventDefault();
          // Navigate to /logout (server clears cookie then redirects back)
          window.location.href = '/logout';
        }}
      >
        logout
      </a>
    </div>
  );
}
