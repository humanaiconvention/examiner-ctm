// Critical hero CSS extracted for first paint. Keep minimal; avoid heavy shadows & animations.
// NOTE: When updating hero styles in App.css, reflect essential layout/visual items here if they affect FCP.
export const criticalHeroCss = `
.page { display:flex; flex-direction:column; min-height:100vh; background: radial-gradient(120% 120% at 10% 10%, rgba(69,115,255,0.28), transparent 45%), radial-gradient(90% 80% at 85% 0%, rgba(73,227,212,0.32), transparent 55%), linear-gradient(180deg,#050812 0%,#050812 45%,#020308 100%); color: var(--ink-primary); }
.hero { position:relative; isolation:isolate; overflow:visible; padding: clamp(4.75rem,8vw,7.75rem) 1.5rem clamp(5.25rem,7vw,7.25rem); margin:0 0 clamp(3.1rem,6.5vw,5.75rem); background:#000105; }
.hero::before { content:''; position:absolute; top:-18%; left:-18%; right:-18%; bottom:-10%; margin:auto; max-width:2100px; background:url('/hero-night-map.jpg') center 22%/cover no-repeat; opacity:.9; filter:contrast(1.1) brightness(1.2) saturate(1.03); pointer-events:none; z-index:0; -webkit-mask-image:linear-gradient(180deg,#000 0%,#000 58%,rgba(0,0,0,0.55) 78%,rgba(0,0,0,0) 94%); mask-image:linear-gradient(180deg,#000 0%,#000 58%,rgba(0,0,0,0.55) 78%,rgba(0,0,0,0) 94%); }
.hero::after { content:''; position:absolute; top:-16%; left:-14%; right:-14%; bottom:-4%; background:linear-gradient(180deg,rgba(0,1,6,0) 0%, rgba(0,1,6,0.6) 47%, rgba(0,1,6,0.82) 62%, #05122f 92%, #05122f 100%); pointer-events:none; z-index:0; }
.hero__inner { position:relative; z-index:1; max-width:960px; margin:0 auto; text-align:left; }
.hero h1 { font-size:clamp(2.6rem,6vw,3.8rem); line-height:1.05; margin:0 0 1.5rem; color:var(--ink-bright); }
.hero__logo-wrap { width:min(640px,88vw); max-width:640px; margin:0 0 2.4rem; position:relative; display:block; }
.hero__logo-wrap--left { margin-left:0; }
.hero__logo-wrap--left-offset { margin-left: clamp(.25rem,3.2vw,2.75rem); }
@media (max-width:560px){ .hero__logo-wrap--left, .hero__logo-wrap--left-offset { margin-left:0; } }
.hero__logo { width:100%; height:auto; display:block; }
.hero__logo--v3 { max-width:560px; }
.logo-humanai { display:flex; flex-direction:column; align-items:center; gap:1.25rem; }
.cta-row { display:flex; flex-wrap:wrap; gap:1rem; align-items:center; }
.cta { display:inline-flex; align-items:center; justify-content:center; padding:.8rem 1.6rem; border-radius:999px; font-weight:600; letter-spacing:.01em; background:var(--accent); color:#020308; border:1px solid transparent; }
.btn-primary { background:var(--accent); color:#020308; }
.btn-secondary { background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.18); color:var(--ink-bright); }
.visually-hidden { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; border:0; }
/* Reduced motion immediate final state (avoid pending transform flash) */
.reduced-motion-active .hero__logo-wrap--enter .hero__logo { animation:none; opacity:1; transform:none; filter:none; }
.hero__logo-wrap--pending .hero__logo { opacity:0; }
`;
