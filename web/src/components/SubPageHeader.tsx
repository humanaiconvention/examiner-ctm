import React from 'react'

interface SubPageHeaderProps {
  activePage?: 'learn-more' | 'convention' | 'framework' | 'preview'
}

export default function SubPageHeader({ activePage }: SubPageHeaderProps) {
  // Navigation helper for SPA transitions
  const navigate = (e: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    e.preventDefault()
    window.history.pushState({}, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  const linkStyle = (isActive: boolean) => ({
    color: isActive ? '#22d3ee' : '#9ca3af', // cyan-400 : gray-400
    textDecoration: 'none',
    transition: 'color 0.2s ease',
    cursor: 'pointer',
    fontSize: '0.875rem', // text-sm
  })

  return (
    <>
      <header className="subpage-header">
        <div className="subpage-header__inner">
          <a href="/" onClick={(e) => navigate(e, '/')} className="subpage-header__logo">
            <img src="/logo.svg" alt="Logo" />
            <span>HumanAI Convention</span>
          </a>
          <nav className="subpage-header__nav">
            <a 
              href="/learn-more" 
              onClick={(e) => navigate(e, '/learn-more')}
              style={linkStyle(activePage === 'learn-more')}
              onMouseOver={(e) => { if(activePage !== 'learn-more') e.currentTarget.style.color = '#fff' }}
              onMouseOut={(e) => { if(activePage !== 'learn-more') e.currentTarget.style.color = '#9ca3af' }}
            >
              Learn More
            </a>
            <a 
              href="/convention" 
              onClick={(e) => navigate(e, '/convention')}
              style={linkStyle(activePage === 'convention')}
              onMouseOver={(e) => { if(activePage !== 'convention') e.currentTarget.style.color = '#fff' }}
              onMouseOut={(e) => { if(activePage !== 'convention') e.currentTarget.style.color = '#9ca3af' }}
            >
              The Convention
            </a>
            <a 
              href="/preview" 
              onClick={(e) => navigate(e, '/preview')}
              style={linkStyle(activePage === 'preview')}
              onMouseOver={(e) => { if(activePage !== 'preview') e.currentTarget.style.color = '#fff' }}
              onMouseOut={(e) => { if(activePage !== 'preview') e.currentTarget.style.color = '#9ca3af' }}
            >
              Preview
            </a>
          </nav>
        </div>
      </header>
      <style>{`
        .subpage-header {
          position: sticky;
          top: 0;
          z-index: 50;
          background-color: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .subpage-header__inner {
          max-width: 72rem; /* max-w-6xl */
          margin: 0 auto;
          padding: 1rem 1.5rem; /* py-4 px-6 */
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .subpage-header__logo {
          display: flex;
          align-items: center;
          gap: 0.75rem; /* gap-3 */
          text-decoration: none;
          color: #e5e7eb; /* text-gray-200 */
        }
        .subpage-header__logo img {
          height: 2rem; /* h-8 */
          width: 2rem; /* w-8 */
        }
        .subpage-header__logo span {
          font-weight: 600;
          font-size: 1.125rem; /* text-lg */
        }
        .subpage-header__nav {
          display: flex;
          align-items: center;
          gap: 1.5rem; /* gap-6 */
        }
      `}</style>
    </>
  )
}
