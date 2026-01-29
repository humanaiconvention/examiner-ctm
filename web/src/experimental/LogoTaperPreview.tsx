// Archived copy of LogoTaperPreview (interactive logo geometry comparison)
// This component was removed from the main bundle. Retained here for future experimentation.
import React from 'react';
import LogoHumanAI from '../components/LogoHumanAI';
import '../components/LogoTaperPreview.css';

// (Removed interactive controls for archived version)

const ArchivedLogoTaperPreview: React.FC = () => {
  // Intentionally stripped of interactive state to keep archived footprint minimal.
  const arcMode = 'parametric' as const;
  const verticalFactor = 0.7;
  const enabled = true;
  const strength = 0.6;
  return (
    <div style={{ padding:'1rem', border:'1px dashed rgba(255,255,255,0.2)', borderRadius:12 }}>
      <h3 style={{ marginTop:0 }}>Archived Logo Taper Preview</h3>
      <p style={{ fontSize:'.75rem', opacity:.75 }}>This tool was removed from production build; safe to delete if no longer needed.</p>
      <div className="preview-grid">
        <div className="preview-cell" aria-label="Uniform variant">
          <div className="preview-label">Uniform</div>
          <LogoHumanAI arcMode={arcMode} verticalFactor={verticalFactor} taperEnabled={false} taperStrength={0} stacked={false} withWordmark={false} />
        </div>
        <div className="preview-cell" aria-label="Tapered variant">
          <div className="preview-label">Tapered</div>
          <LogoHumanAI arcMode={arcMode} verticalFactor={verticalFactor} taperEnabled={enabled} taperStrength={strength} stacked={false} withWordmark={false} />
        </div>
      </div>
    </div>
  );
};

export default ArchivedLogoTaperPreview;
