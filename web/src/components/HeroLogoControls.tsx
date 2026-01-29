import React from 'react';
import HeroLogoWordmark, { type HeroLogoLayout } from './HeroLogoWordmark';

interface HeroLogoControlsProps {
  initial: {
    layout: HeroLogoLayout;
    align: 'start' | 'center';
    logoScale: number;
    gapScale: number;
    lineGapScale: number;
    autoStackBreakpoint: number;
  };
}

const number = (v: string, fallback: number) => {
  const n = parseFloat(v); return isNaN(n) ? fallback : n;
};

const HeroLogoControls: React.FC<HeroLogoControlsProps> = ({ initial }) => {
  const [layout, setLayout] = React.useState<HeroLogoLayout>(initial.layout);
  const [align, setAlign] = React.useState<'start' | 'center'>(initial.align);
  const [logoScale, setLogoScale] = React.useState(initial.logoScale);
  const [gapScale, setGapScale] = React.useState(initial.gapScale);
  const [lineGapScale, setLineGapScale] = React.useState(initial.lineGapScale);
  const [autoStackBreakpoint, setBreakpoint] = React.useState(initial.autoStackBreakpoint);

  return (
    <div style={{ position:'fixed', bottom:0, right:0, zIndex:60, background:'rgba(10,12,18,0.9)', backdropFilter:'blur(6px)', color:'#fff', padding:'1rem 1.1rem 1.25rem', width:'min(340px, 100%)', fontSize:'.75rem', borderTopLeftRadius:'12px', boxShadow:'0 -4px 28px -6px rgba(0,0,0,0.55)' }}>
      <strong style={{ fontSize:'.65rem', letterSpacing:'.15em', textTransform:'uppercase', opacity:.7, display:'block', marginBottom:'.4rem' }}>Hero Logo Controls</strong>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:'.6rem .8rem' }}>
        <label style={{ display:'flex', flexDirection:'column', gap:'.15rem' }}>Layout
          <select value={layout} onChange={e => setLayout(e.target.value as HeroLogoLayout)} style={{ padding:'.25rem .4rem', background:'#111825', color:'#fff', border:'1px solid #273247', borderRadius:6 }}>
            <option value="horizontal-left">horizontal-left</option>
            <option value="horizontal-right">horizontal-right</option>
            <option value="stacked">stacked</option>
          </select>
        </label>
        <label style={{ display:'flex', flexDirection:'column', gap:'.15rem' }}>Align
          <select value={align} onChange={e => setAlign(e.target.value as 'start' | 'center')} style={{ padding:'.25rem .4rem', background:'#111825', color:'#fff', border:'1px solid #273247', borderRadius:6 }}>
            <option value="center">center</option>
            <option value="start">start</option>
          </select>
        </label>
        <label style={{ display:'flex', flexDirection:'column', gap:'.15rem' }}>Logo scale
          <input type="number" step="0.05" value={logoScale} onChange={e => setLogoScale(number(e.target.value, logoScale))} style={{ padding:'.25rem .4rem', background:'#0d141f', color:'#fff', border:'1px solid #273247', borderRadius:6 }} />
        </label>
        <label style={{ display:'flex', flexDirection:'column', gap:'.15rem' }}>Gap scale
          <input type="number" step="0.05" value={gapScale} onChange={e => setGapScale(number(e.target.value, gapScale))} style={{ padding:'.25rem .4rem', background:'#0d141f', color:'#fff', border:'1px solid #273247', borderRadius:6 }} />
        </label>
        <label style={{ display:'flex', flexDirection:'column', gap:'.15rem' }}>Line gap
          <input type="number" step="0.05" value={lineGapScale} onChange={e => setLineGapScale(number(e.target.value, lineGapScale))} style={{ padding:'.25rem .4rem', background:'#0d141f', color:'#fff', border:'1px solid #273247', borderRadius:6 }} />
        </label>
        <label style={{ display:'flex', flexDirection:'column', gap:'.15rem' }}>Breakpoint
          <input type="number" step="20" value={autoStackBreakpoint} onChange={e => setBreakpoint(number(e.target.value, autoStackBreakpoint))} style={{ padding:'.25rem .4rem', background:'#0d141f', color:'#fff', border:'1px solid #273247', borderRadius:6 }} />
        </label>
      </div>
      <div style={{ marginTop:'.85rem', padding:'.6rem .7rem', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:8 }}>
        <HeroLogoWordmark layout={layout} align={align} logoScale={logoScale} gapScale={gapScale} lineGapScale={lineGapScale} autoStackBreakpoint={autoStackBreakpoint} />
      </div>
    </div>
  );
};

export default HeroLogoControls;
