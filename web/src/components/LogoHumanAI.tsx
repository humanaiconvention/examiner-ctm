import React, { useEffect, useRef, useMemo, useState, useLayoutEffect } from 'react';

type LogoVariant = 'mono-light' | 'mono-dark' | 'accent';

export interface LogoMetrics {
  headGap: number; headDiameter: number; pillarWidth: number; pillarHeight: number;
  lateralClearTarget: number; centerlineGap: number; actualMidClearance: number;
  width: number; height: number; phiDeviation: number; spreadHalf: number;
  pillarMinWidth?: number;
  arcMinThickness?: number;
}

interface LogoProps {
  className?: string;
  title?: string;
  variant?: LogoVariant;
  withWordmark?: boolean;
  stacked?: boolean; // stacked places mark above wordmark
  showConvention?: boolean; // adds second line "Convention"
  arcMode?: 'legacy' | 'clipped' | 'parametric'; // rendering mode for outer arcs
  /**
   * Multiplier applied to default lateral clearance (HEAD_GAP / φ).
   * 1 = current golden default. >1 widens gap, <1 narrows (but never below 0 visually enforced).
   */
  lateralClearFactor?: number;
  /** Display construction guides (pillar edges, clearance, ratios) */
  showDebug?: boolean;
  /** Number of Bezier segments (per half outer curve). Higher = smoother. Minimum 3. */
  bezierSteps?: number;
  /** Horizontal spread multiplier for arcs (1 = golden default). */
  arcSpreadFactor?: number;
  /** Enforce overall Height = Width * PHI (global bounding box). */
  enforceGlobalPhi?: boolean;
  /** Factor controlling proportional centerline inner gap (relative to pillar edge clearance). If omitted, legacy fixed 10px retained. 1 = exactly pillarHalf + lateralClear. Values <1 allow tighter approach but never overlap pillar. */
  centerlineGapFactor?: number;
  /** When true, logs computed geometry metrics each render (dev only). */
  logMetrics?: boolean;
  /** Callback invoked (once per metrics change) with computed geometry metrics. */
  onMetrics?: (m: LogoMetrics) => void;
  /**
   * Vertical height scaling factor applied to the legacy pillar height (190px). Values < 1 compress
   * the logo vertically (reducing overall height vs width). Defaults to 0.7 for more compact mark.
   * Clamp range [0.4,1.0].
   */
  verticalFactor?: number;
  /** Enable inward-only taper that pinches midpoint thickness without expanding endpoints. */
  taperEnabled?: boolean;
  /** Strength 0..1: 0 = uniform, 1 = max (thick:thin ratio approaches φ). */
  taperStrength?: number;
  /** Disable dynamic JS-computed spacing; rely on CSS fallback margin. */
  lockWordmarkSpacing?: boolean;
  /** Embed wordmark text inside SVG (for single-asset export). */
  embedWordmark?: boolean;
}

/**
 * New minimalist HumanAI mark:
 *  - Outer arcs suggest collaboration & duality.
 *  - Central pillar + dot evokes human + AI alignment & an information channel.
 * Variant 3 requested: monochrome white on dark hero. We also support dark-on-light.
 */
export const LogoHumanAI: React.FC<LogoProps> = ({
  className = '',
  title = 'HumanAI Convention',
  variant = 'mono-light',
  withWordmark = true,
  stacked = true,
  showConvention = true,
  arcMode = 'parametric',
  lateralClearFactor = 1,
  showDebug = false,
  bezierSteps = 6,
  arcSpreadFactor = 1,
  enforceGlobalPhi = true,
  centerlineGapFactor,
  logMetrics = false,
  onMetrics,
  verticalFactor = 1.0,
  taperEnabled = true,
  taperStrength = 1.0,
  lockWordmarkSpacing = false,
  embedWordmark = false
}) => {
  const isLight = variant === 'mono-light' || variant === 'accent';
  const fg = variant === 'accent' ? '#ffc640' : isLight ? '#ffffff' : '#000000';
  const secondary = variant === 'accent' ? '#9fb400' : fg;
  const wordColor = fg;
  const aiAccent = variant === 'accent' ? '#ffc640' : fg;

  // Golden ratio driven proportions (four elements: head circle, gap, pillar, arcs)
  // Constraints provided:
  //  P = φ * (Gap + HeadDiameter)
  //  HeadDiameter = (φ * (Gap + HeadDiameter)) / 2  => P = 2 * HeadDiameter
  //  Arc max width (combined left+right) W satisfies: P = W * φ  => W = P / φ
  // Derived: Gap = HeadDiameter * (2 - φ) / φ and CombinedHeight (Gap + HeadDiameter) = P / φ.
  const PHI = (1 + Math.sqrt(5)) / 2; // φ ≈ 1.618
  // Pillar width will be derived (not fixed) to satisfy: pillar width = (space between pillar and head circle) / φ
  // We'll first compute gap and then back-solve pillar width.
  let STROKE = 20; // temporary placeholder (overwritten below once HEAD_GAP known)
  // We'll compute center dynamically after determining final outer radius.
  let HEAD_CX = 100; // temporary placeholder; recalculated later if spread widens viewBox
  const TRIM_TOP = 22; // anchor top of pillar
  const LEGACY_PILLAR_H = 212 - TRIM_TOP; // original 190px
  const vf = Math.min(1, Math.max(0.4, verticalFactor));
  const PILLAR_H = LEGACY_PILLAR_H * vf; // compressed pillar height
  const TRIM_BOTTOM = TRIM_TOP + PILLAR_H; // dynamic bottom
  // Preserve prior vertical gap relative to pillar by deriving original gap directly from pillar height:
  // Original relationship was: HEAD_DIAMETER_ORIG = PILLAR_H / 2 and HEAD_GAP = HEAD_DIAMETER_ORIG * (2 - PHI)/PHI.
  const HEAD_GAP = (PILLAR_H / 2) * (2 - PHI) / PHI;
  // New requirement: reduce head so that HEAD_DIAMETER = HEAD_GAP * PHI (instead of previous much larger value).
  const HEAD_DIAMETER = HEAD_GAP * PHI;
  const HEAD_R = HEAD_DIAMETER / 2;
  STROKE = HEAD_GAP / PHI; // initial provisional pillar width (will be updated to arc thickness later)
  let PILLAR_W = STROKE;
  let PILLAR_X = HEAD_CX - PILLAR_W / 2;
  const PILLAR_Y = TRIM_TOP;
  const HEAD_CY = TRIM_TOP - HEAD_GAP - HEAD_R; // bottom of head sits HEAD_GAP above pillar top

  // If the head y becomes negative (elevated beyond viewBox), we shift entire geometry down via group offset.
  const GEOM_MIN_Y = HEAD_CY - HEAD_R;
  const OFFSET_Y = GEOM_MIN_Y < 0 ? -GEOM_MIN_Y + 8 : 0; // add small padding when shifting

  // Pillar midpoint & arc geometry per golden ratio constraints
  const PILLAR_MID_Y = PILLAR_Y + PILLAR_H / 2;
  const ARC_FULL_WIDTH = PILLAR_H / PHI; // W = P / φ (golden base)
  let RX_OUTER = (ARC_FULL_WIDTH / 2) * arcSpreadFactor; // base + spread
  const RY_OUTER = PILLAR_H / 2; // vertical semi-axis aligned with pillar
  // Variable thickness profile (implicit): we compute local horizontal radius modulation on the fly
  // using a sinusoidal easing so ends are thicker than the midpoint. Explicit constants removed
  // after refactor; golden ratio still drives relative thinness at center (1/φ factor).
  // Lateral clearance requirement: ensure inner boundary (at midpoint where thickness smallest) is at least gap from pillar.
  // Pillar half-width = PILLAR_W / 2. Let desired clearance ratio pick HEAD_GAP / PHI^2 for subtle spacing.
  // Locked lateral gap between pillar edge and inner arc at midpoint:
  // gap_lateral = (gap between head and pillar) / φ = HEAD_GAP / PHI
  const LATERAL_CLEAR = (HEAD_GAP / PHI) * (lateralClearFactor <= 0 ? 0 : lateralClearFactor);
  // Fixed centerline inner gap requirement (overrides computed lateral clearance for inner boundary positioning)
  // Centerline gap (legacy fixed 10px will be updated later once pillarHalf known if factor provided)
  // We want default midpoint clearance to equal HEAD_GAP/PHI (golden lateral clear). We'll set a provisional value and
  // refine below if user provided explicit factor.
  let CENTERLINE_GAP = 0; // placeholder until pillarHalf known
  const pillarHalf = PILLAR_W / 2;
  // Recompute proportional centerline gap now that pillarHalf known
  if (typeof centerlineGapFactor === 'number' && !Number.isNaN(centerlineGapFactor)) {
    const baseDesiredCenterline = pillarHalf + LATERAL_CLEAR; // minimum aesthetic target
    const factor = Math.max(0.2, centerlineGapFactor); // clamp to avoid collapse
    CENTERLINE_GAP = baseDesiredCenterline * factor;
  } else {
    // Default: set centerline so actualMidClearance (CENTERLINE_GAP - pillarHalf) ≈ HEAD_GAP / PHI.
    CENTERLINE_GAP = pillarHalf + (HEAD_GAP / PHI);
  }
  const minSafe = pillarHalf + 1; // ensure at least 1px outside pillar edge
  if (CENTERLINE_GAP < minSafe) CENTERLINE_GAP = minSafe;
  // Global PHI enforcement: overall geometry height vs width.
  // Overall height (top of head to bottom of pillar) = (TRIM_BOTTOM) - (HEAD_CY - HEAD_R)
  const overallHeight = TRIM_BOTTOM - (HEAD_CY - HEAD_R);
  if (enforceGlobalPhi) {
    // Desired width = overallHeight / PHI. Our width spans HEAD_CX ± RX_OUTER currently (width = 2*RX_OUTER).
    const desiredHalfWidth = (overallHeight / PHI) / 2;
    if (desiredHalfWidth > RX_OUTER) {
      RX_OUTER = desiredHalfWidth; // widen arcs to satisfy global ratio
    } else if (desiredHalfWidth < RX_OUTER) {
      // Alternatively could shrink; choose widen-only to avoid pillar overlap; uncomment to allow shrink:
      // RX_OUTER = desiredHalfWidth;
    }
  }
  // Ensure outer radius large enough so that after inward taper at midpoint we still respect clearance.
  // Use approximate midpoint horizontal shrink factor (1/PHI) to estimate minimal outer radius.
  const shrinkMid = 1/PHI; // thicknessFactor at midpoint
  const minAllowedInner = pillarHalf + LATERAL_CLEAR; // desired inner face clearance from pillar edge
  if (RX_OUTER * shrinkMid < minAllowedInner) {
    RX_OUTER = minAllowedInner / shrinkMid; // expand to satisfy constraint
  }
  // Angle span: full top (0) to bottom (π)
  const angleTop = 0;
  const angleBottom = Math.PI;
  const angleSpan = angleBottom - angleTop;
  // (Removed previous SEGMENTS sampling; Bezier smoothing uses KEY_STEPS instead.)
  // Legacy/clipped support (retain for modes):
  const ARC_CLIP_TOP = TRIM_TOP;
  const ARC_CLIP_BOTTOM = TRIM_BOTTOM; // full pillar span

  // Will capture taper-derived minima for metrics
  let arcMinThicknessActual: number | undefined;
  let pillarMinWidthActual: number | undefined;


  function ringPoint(angle: number, rx: number, ry: number, isRight: boolean) {
    const x = HEAD_CX + (isRight ? 1 : -1) * rx * Math.sin(angle);
    const y = PILLAR_MID_Y - ry * Math.cos(angle);
    return { x, y };
  }

  /**
   * Create a smooth cubic Bezier chain approximating the outer half ellipse.
   * We'll sample a coarse set of key angles then derive control points using adjacent midpoints (Catmull-Rom to Bezier).
   */
  function buildHalfRing(isRight: boolean) {
  const steps = Math.max(3, Math.floor(bezierSteps));
    interface Pt { x:number; y:number; t:number; thick:number; }
    const outer: Pt[] = [];
    // Thickness profile constants (reinstate for explicit control)
  const THICK_END = HEAD_GAP / PHI; // thickness at ends (unchanged)
  const THICK_MID = THICK_END / PHI; // thickness at midpoint
  // Slightly widen base outer radius for more horizontal spread (user requested)
  const OUTER_SPREAD_FACTOR = 1.15; // can expose as prop later
  const baseOuterRx = RX_OUTER * OUTER_SPREAD_FACTOR;
    for (let i = 0; i <= steps; i++) {
      const tNorm = i / steps; // 0..1 top->bottom
      const a = angleTop + angleSpan * tNorm;
      const midEase = Math.sin(tNorm * Math.PI); // 0 ends,1 mid
      const shapeFactor = 1 - (1 - 1/PHI) * midEase; // horizontal squash at mid
  const localRx = baseOuterRx * shapeFactor;
      // thickness interpolation (larger at ends)
      const thick = THICK_END - (THICK_END - THICK_MID) * midEase;
      const p = ringPoint(a, localRx, RY_OUTER, isRight);
      outer.push({ x: p.x, y: p.y, t: tNorm, thick });
    }
    // Compute inner offset curve by moving along inward normals.
    const inner: Pt[] = [];
    for (let i = 0; i < outer.length; i++) {
      const prev = outer[i - 1 < 0 ? 0 : i - 1];
      const next = outer[i + 1 >= outer.length ? outer.length - 1 : i + 1];
      const tx = next.x - prev.x;
      const ty = next.y - prev.y;
      const len = Math.hypot(tx, ty) || 1;
      // Normal pointing outward (rotate tangent left)
      let nx = -ty / len;
      let ny = tx / len;
      // We want inward towards pillar center.
      const centerDirX = HEAD_CX - outer[i].x; // if positive, inward is +x
      if ((centerDirX < 0 && nx > 0) || (centerDirX > 0 && nx < 0)) {
        nx *= -1; ny *= -1;
      }
      // Offset magnitude = thickness plus guaranteed clearance buffer from pillar edge.
  const offset = outer[i].thick;
  let ix = outer[i].x + nx * offset;
      // Override to enforce fixed centerline gap: clamp to HEAD_CX ± CENTERLINE_GAP
      const targetX = HEAD_CX + (isRight ? CENTERLINE_GAP : -CENTERLINE_GAP);
      if (isRight ? (ix < targetX) : (ix > targetX)) {
        ix = targetX;
      }
      const iy = outer[i].y + ny * offset;
      inner.push({ x: ix, y: iy, t: outer[i].t, thick: outer[i].thick });
    }
    // Build Bezier chain helper (Catmull-Rom) for arbitrary point list.
    interface BPt { x:number; y:number; }
    function catmullToBezier(p0:BPt, p1:BPt, p2:BPt, p3:BPt) {
      const CR_SCALE = 1/6;
      return {
        c1x: p1.x + (p2.x - p0.x) * CR_SCALE,
        c1y: p1.y + (p2.y - p0.y) * CR_SCALE,
        c2x: p2.x - (p3.x - p1.x) * CR_SCALE,
        c2y: p2.y - (p3.y - p1.y) * CR_SCALE
      };
    }
    const path: string[] = [];
    // Outer forward
    path.push(`M ${outer[0].x} ${outer[0].y}`);
    for (let i = 0; i < outer.length - 1; i++) {
      const p0 = outer[i === 0 ? 0 : i - 1];
      const p1 = outer[i];
      const p2 = outer[i + 1];
      const p3 = outer[i + 2 < outer.length ? i + 2 : i + 1];
      const { c1x, c1y, c2x, c2y } = catmullToBezier(p0, p1, p2, p3);
      path.push(`C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`);
    }
    // Inner reverse
    const rev = [...inner].reverse();
    // Connect from outer bottom to inner bottom with a straight join for stability
    path.push(`L ${rev[0].x} ${rev[0].y}`);
    for (let i = 0; i < rev.length - 1; i++) {
      const p0 = rev[i === 0 ? 0 : i - 1];
      const p1 = rev[i];
      const p2 = rev[i + 1];
      const p3 = rev[i + 2 < rev.length ? i + 2 : i + 1];
      const { c1x, c1y, c2x, c2y } = catmullToBezier(p0, p1, p2, p3);
      path.push(`C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`);
    }
    path.push('Z');
    return path.join(' ');
  }

  // Metrics we want to surface (computed after paths built)
  // (LogoMetrics interface exported above)

  // Compute bounds BEFORE building paths so we can re-center if needed.
  let tempArcMaxX = HEAD_CX + RX_OUTER + 4;
  let tempArcMinX = HEAD_CX - RX_OUTER - 4;
  let VIEWBOX_WIDTH = 200;
  if (tempArcMaxX - tempArcMinX + 16 > VIEWBOX_WIDTH) {
    VIEWBOX_WIDTH = tempArcMaxX - tempArcMinX + 16;
    HEAD_CX = VIEWBOX_WIDTH / 2;
    PILLAR_X = HEAD_CX - PILLAR_W / 2;
  }
  // After potential recenter, recompute arc bounds for debug annotation.
  tempArcMaxX = HEAD_CX + RX_OUTER + 4;
  tempArcMinX = HEAD_CX - RX_OUTER - 4;
  const groupTranslateX = 0;
  // Build paths now with final HEAD_CX
  let parametricLeftPath = buildHalfRing(false);
  let parametricRightPath = buildHalfRing(true);

  // Override parametric mode with circular band geometry ensuring fixed clearance from pillar
  if (arcMode === 'parametric') {
    const outerR = PILLAR_H / 2; // circular envelope
    const desiredClearance = HEAD_GAP / PHI;
    // Solve for inner radius & thickness given a pillar width guess
    const solve = (pillarW: number) => {
      const half = pillarW / 2;
      const baseInnerMin = Math.max(half + desiredClearance, half + 1);
      // Pick aesthetically slender thickness via blended factors
      const phiScale = 1 / (PHI * PHI);
      const targetFactor = 0.25;
      const thicknessFactor = (phiScale + targetFactor) / 2;
      let trialThickness = (outerR - baseInnerMin) * thicknessFactor;
      let trialInner = outerR - trialThickness;
      if (trialInner < baseInnerMin) { trialInner = baseInnerMin; trialThickness = outerR - trialInner; }
      return { innerR: trialInner, thickness: trialThickness };
    };
    // Iterate once updating pillar width to match thickness
    let { innerR, thickness } = solve(PILLAR_W);
    PILLAR_W = thickness; PILLAR_X = HEAD_CX - PILLAR_W / 2;
    ({ innerR, thickness } = solve(PILLAR_W));
    PILLAR_W = thickness; PILLAR_X = HEAD_CX - PILLAR_W / 2;
    CENTERLINE_GAP = innerR; // use uniform inner radius as baseline centerline gap

  // Fixed inner span now locked at 132° after pruning variants.
  const INNER_SPAN_DEG = 132;
  const effectiveOuterR = outerR; // no scaling
  const deg = (d:number)=> d * Math.PI/180;
  const innerMid = deg(90);
  const innerStart = deg(90 - INNER_SPAN_DEG/2); // 24°
  const innerEnd = deg(90 + INNER_SPAN_DEG/2);   // 156°
  // Analytic mapping retained (original A1 behavior)
  const sinOuterStart = Math.sin(innerStart) * (innerR / effectiveOuterR);
  const outerStart = Math.asin(Math.min(1, Math.max(-1, sinOuterStart)));
  const outerEnd = Math.PI - outerStart; // symmetry
    const polar = (r:number,a:number)=> ({ x: HEAD_CX + r * Math.sin(a), y: PILLAR_MID_Y - r * Math.cos(a) });
    const polarL = (r:number,a:number)=> ({ x: HEAD_CX - r * Math.sin(a), y: PILLAR_MID_Y - r * Math.cos(a) });
    const oS = polar(outerR, outerStart); const oM = polar(outerR, innerMid); const oE = polar(outerR, outerEnd);
    const loS = polarL(outerR, outerStart); const loM = polarL(outerR, innerMid); const loE = polarL(outerR, outerEnd);

    const strength = Math.min(1, Math.max(0, taperStrength));
    if (!taperEnabled || strength === 0) {
      // Uniform annulus sector
      const iS = polar(innerR, innerStart), iM = polar(innerR, innerMid), iE = polar(innerR, innerEnd);
      const liS = polarL(innerR, innerStart), liM = polarL(innerR, innerMid), liE = polarL(innerR, innerEnd);
      parametricRightPath = [
        `M ${oS.x} ${oS.y}`,
        `A ${outerR} ${outerR} 0 0 1 ${oM.x} ${oM.y}`,
        `A ${outerR} ${outerR} 0 0 1 ${oE.x} ${oE.y}`,
        `L ${iE.x} ${iE.y}`,
        `A ${innerR} ${innerR} 0 0 0 ${iM.x} ${iM.y}`,
        `A ${innerR} ${innerR} 0 0 0 ${iS.x} ${iS.y}`,
        'Z'
      ].join(' ');
      parametricLeftPath = [
        `M ${loS.x} ${loS.y}`,
        `A ${outerR} ${outerR} 0 0 0 ${loM.x} ${loM.y}`,
        `A ${outerR} ${outerR} 0 0 0 ${loE.x} ${loE.y}`,
        `L ${liE.x} ${liE.y}`,
        `A ${innerR} ${innerR} 0 0 1 ${liM.x} ${liM.y}`,
        `A ${innerR} ${innerR} 0 0 1 ${liS.x} ${liS.y}`,
        'Z'
      ].join(' ');
    } else {
      // Inward-only taper: keep outer radius fixed; vary inner radius (thin mid)
      const targetRatio = PHI; // max (thick:thin)
      const ratio = 1 + (targetRatio - 1) * strength;
      const baseThickness = outerR - innerR; // thickness at ends
      const minThickness = baseThickness / ratio; // thickness at midpoint
      arcMinThicknessActual = minThickness;
      // Sample inner arc from innerEnd->innerStart (clockwise) for right side
      const SAMPLES = 48;
      const halfSpan = innerEnd - innerMid; // 60°
      const innerPtsR: {x:number;y:number;}[] = [];
      const innerPtsL: {x:number;y:number;}[] = [];
      for (let i=0;i<=SAMPLES;i++) {
        const theta = innerEnd - (innerEnd - innerStart)*(i/SAMPLES);
        const u = (theta - innerMid)/halfSpan; // -1..1
        const w = u*u; // 0 mid,1 ends
        const tLocal = minThickness + (baseThickness - minThickness) * w;
        const rInnerLocal = outerR - tLocal;
        innerPtsR.push(polar(rInnerLocal, theta));
        innerPtsL.push(polarL(rInnerLocal, theta));
      }
      // Right
      parametricRightPath = [
        `M ${oS.x} ${oS.y}`,
        `A ${outerR} ${outerR} 0 0 1 ${oM.x} ${oM.y}`,
        `A ${outerR} ${outerR} 0 0 1 ${oE.x} ${oE.y}`,
        `L ${innerPtsR[0].x} ${innerPtsR[0].y}`,
        ...innerPtsR.slice(1).map(p=>`L ${p.x} ${p.y}`),
        'Z'
      ].join(' ');
      // Left
      parametricLeftPath = [
        `M ${loS.x} ${loS.y}`,
        `A ${outerR} ${outerR} 0 0 0 ${loM.x} ${loM.y}`,
        `A ${outerR} ${outerR} 0 0 0 ${loE.x} ${loE.y}`,
        `L ${innerPtsL[0].x} ${innerPtsL[0].y}`,
        ...innerPtsL.slice(1).map(p=>`L ${p.x} ${p.y}`),
        'Z'
      ].join(' ');
    }
    RX_OUTER = outerR; // metrics basis
  }

  // Pillar taper path (optional inward pinch) built after potential PILLAR_W adjustments
  let pillarElement: React.ReactNode = <rect x={PILLAR_X} y={PILLAR_Y} width={PILLAR_W} height={PILLAR_H} rx={4} fill={fg} />;
  if (taperEnabled && taperStrength > 0) {
    const strength = Math.min(1, Math.max(0, taperStrength));
    const targetRatio = PHI;
    const ratio = 1 + (targetRatio - 1) * strength; // endThickness : midThickness
    const midW = PILLAR_W / ratio;
    pillarMinWidthActual = midW;
    const samples = 24; // fewer base samples; Bezier smoothing will handle curvature
    interface P { x:number; y:number; }
    const left: P[] = [];
    const right: P[] = [];
    for (let i=0;i<=samples;i++) {
      const t = i / samples; // 0..1 top->bottom
      const y = PILLAR_Y + PILLAR_H * t;
      const v = (y - PILLAR_MID_Y) / (PILLAR_H/2); // -1..1
      const w = v*v; // 0 mid,1 ends (keeps endpoints wide)
      const widthHere = midW + (PILLAR_W - midW) * w;
      const halfW = widthHere / 2;
      left.push({ x: HEAD_CX - halfW, y });
      right.push({ x: HEAD_CX + halfW, y });
    }
    // Catmull-Rom -> Bezier helper
    const catmull = (p0:P,p1:P,p2:P,p3:P) => {
      const s = 1/6;
      return {
        c1x: p1.x + (p2.x - p0.x)*s,
        c1y: p1.y + (p2.y - p0.y)*s,
        c2x: p2.x - (p3.x - p1.x)*s,
        c2y: p2.y - (p3.y - p1.y)*s
      };
    };
    const path: string[] = [];
    // Start at top-right
    path.push(`M ${right[0].x} ${right[0].y}`);
    for (let i=0;i<right.length-1;i++) {
      const p0 = right[i === 0 ? 0 : i-1];
      const p1 = right[i];
      const p2 = right[i+1];
      const p3 = right[i+2 < right.length ? i+2 : i+1];
      const { c1x,c1y,c2x,c2y } = catmull(p0,p1,p2,p3);
      path.push(`C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`);
    }
    // Bottom join (right -> left) straight segment ensures crisp base
    const bottomLeft = left[left.length-1];
    path.push(`L ${bottomLeft.x} ${bottomLeft.y}`);
    // Up the left side (reverse Catmull on reversed array)
    for (let i=left.length-1;i>0;i--) {
      const p0 = left[i+1 > left.length-1 ? left.length-1 : i+1];
      const p1 = left[i];
      const p2 = left[i-1];
      const p3 = left[i-2 < 0 ? 0 : i-2];
      const { c1x,c1y,c2x,c2y } = catmull(p0,p1,p2,p3);
      path.push(`C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`);
    }
    path.push('Z');
    pillarElement = <path d={path.join(' ')} fill={fg} />;
  }

  // Apply circular caps after taper shape if B* variant selected (overwrite pillarElement)
  // (Removed circular cap variants)

  // After building we can estimate actual midpoint inner clearance: CENTERLINE_GAP - pillarHalf
  const actualMidClearance = CENTERLINE_GAP - (PILLAR_W / 2); // with circular arcs, this equals innerR - pillarHalf
  const widthEstimate = (RX_OUTER * 2);
  const heightEstimate = overallHeight;
  const targetWidthForPhi = heightEstimate / PHI;
  const phiDeviation = widthEstimate - targetWidthForPhi; // positive = wider than golden
  const metrics: LogoMetrics = useMemo(() => {
    return {
      headGap: HEAD_GAP,
      headDiameter: HEAD_DIAMETER,
      pillarWidth: PILLAR_W,
      pillarHeight: PILLAR_H,
      lateralClearTarget: LATERAL_CLEAR,
      centerlineGap: CENTERLINE_GAP,
      actualMidClearance,
      width: widthEstimate,
      height: heightEstimate,
      phiDeviation,
      spreadHalf: RX_OUTER,
      pillarMinWidth: pillarMinWidthActual,
      arcMinThickness: arcMinThicknessActual
    } as LogoMetrics;
  }, [HEAD_GAP, HEAD_DIAMETER, PILLAR_W, PILLAR_H, LATERAL_CLEAR, CENTERLINE_GAP, actualMidClearance, widthEstimate, heightEstimate, phiDeviation, RX_OUTER, pillarMinWidthActual, arcMinThicknessActual]);

  // Derived vertical bounds
  const topVisible = PILLAR_MID_Y - RY_OUTER;
  const legacyBottom = TRIM_BOTTOM + 22 * vf; // shrink added padding slightly when compressed
  const parametricBottom = PILLAR_MID_Y + RY_OUTER;
  const bottomVisible = Math.max(parametricBottom, legacyBottom);
  const VIEWBOX_HEIGHT = (bottomVisible - topVisible) + OFFSET_Y + 16;

  function renderArcs() {
    if (arcMode === 'parametric') {
      return (
        <g className="logo-arcs--parametric">
          <path d={parametricLeftPath} fill={secondary} />
          <path d={parametricRightPath} fill={secondary} />
        </g>
      );
    }
    if (arcMode === 'clipped') {
      return (
        <g>
          <defs>
            <clipPath id="arc-band">
              <rect x={0} y={ARC_CLIP_TOP} width={VIEWBOX_WIDTH} height={ARC_CLIP_BOTTOM - ARC_CLIP_TOP} />
            </clipPath>
          </defs>
          <g clipPath="url(#arc-band)">
            <path
              d="M100 212c-54 0-98-44-98-98 0-43.8 28.3-81.1 67.6-94.2l.6 22.2C42 56 24 83.8 24 114c0 42 34 76 76 76v22z"
              fill={secondary}
            />
            <path
              d="M100 212c54 0 98-44 98-98 0-43.8-28.3-81.1-67.6-94.2l-.6 22.2C158 56 176 83.8 176 114c0 42-34 76-76 76v22z"
              fill={secondary}
            />
          </g>
        </g>
      );
    }
    // legacy mode
    return (
      <g className="logo-arcs--legacy">
        <path
          d="M100 212c-54 0-98-44-98-98 0-43.8 28.3-81.1 67.6-94.2l.6 22.2C42 56 24 83.8 24 114c0 42 34 76 76 76v22z"
          fill={secondary}
        />
        <path
          d="M100 212c54 0 98-44 98-98 0-43.8-28.3-81.1-67.6-94.2l-.6 22.2C158 56 176 83.8 176 114c0 42-34 76-76 76v22z"
          fill={secondary}
        />
      </g>
    );
  }

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [wordmarkOffset, setWordmarkOffset] = useState<number | null>(null);

  // Recompute wordmark vertical offset so the space between bottom of head circle and top of wordmark
  // equals the head gap (mirroring the gap above the pillar). This fulfills: spacing below circle = spacing above pillar.
  useLayoutEffect(() => {
    if (lockWordmarkSpacing || embedWordmark) return; // skip dynamic external spacing
    if (!withWordmark || !showConvention) return;
    const el = svgRef.current;
    if (!el) return;
    const compute = () => {
      const boxW = el.getBoundingClientRect().width;
      const scale = boxW / VIEWBOX_WIDTH;
      setWordmarkOffset(metrics.headGap * scale);
    };
    compute();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => compute());
      ro.observe(el);
      return () => ro.disconnect();
    } else {
      const onR = () => compute();
      window.addEventListener('resize', onR);
      return () => window.removeEventListener('resize', onR);
    }
  }, [metrics, withWordmark, showConvention, lockWordmarkSpacing, embedWordmark, VIEWBOX_WIDTH]);

  // Optional embedded wordmark group (inside SVG) for export (placed after arcs so it stays on top visually)
  let embeddedWordmark: React.ReactNode = null;
  if (embedWordmark && withWordmark) {
    const gap = metrics.headGap; // viewBox units
    const primaryFontSize = HEAD_R * 2.2;
    const secondaryFontSize = HEAD_R * 1.4;
    const baseY = PILLAR_MID_Y + RY_OUTER + gap + primaryFontSize * 0.6; // approximate baseline
    embeddedWordmark = (
      <g className="logo-wordmark-embedded" fontFamily="Inter, system-ui, sans-serif" textAnchor="middle" fill={fg}>
        <text x={HEAD_CX} y={baseY} fontSize={primaryFontSize} fontWeight={300} letterSpacing={0.02 * primaryFontSize}>
          {/* Use a normal space before AI instead of dx offset so total line remains perfectly centered on HEAD_CX */}
          <tspan fill={wordColor}>Human</tspan>
          <tspan fontWeight={400} letterSpacing={0.04 * primaryFontSize} fill={aiAccent}> AI</tspan>
        </text>
        {showConvention && (
          <text x={HEAD_CX} y={baseY + secondaryFontSize * 1.25} fontSize={secondaryFontSize} fontWeight={300} opacity={0.9} letterSpacing={0.015 * secondaryFontSize}>Convention</text>
        )}
      </g>
    );
  }

  const mark = (
    <svg
      ref={svgRef}
      className={`logo-mark ${stacked ? 'logo-mark--stacked' : ''}`}
      role="img"
      aria-label={title}
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      width="100%"
      preserveAspectRatio="xMidYMid meet"
      shapeRendering="geometricPrecision"
    >
      {title ? <title>{title}</title> : null}
      <g transform={`translate(${groupTranslateX}, ${OFFSET_Y})`}>
        {/* Head (human dot) */}
        <circle cx={HEAD_CX} cy={HEAD_CY} r={HEAD_R} fill={fg} />
        {/* Central pillar (optional inward taper) */}
        {pillarElement}
        {renderArcs()}
        {embeddedWordmark}
        {showDebug && (
          <g className="logo-debug" strokeWidth={0.75} vectorEffect="non-scaling-stroke" fontSize={8} fontFamily="monospace">
            {/* Pillar edges */}
            <line x1={PILLAR_X} y1={PILLAR_Y-10} x2={PILLAR_X} y2={PILLAR_Y+PILLAR_H+10} stroke="#ff00aa" strokeDasharray="3 2" />
            <line x1={PILLAR_X+PILLAR_W} y1={PILLAR_Y-10} x2={PILLAR_X+PILLAR_W} y2={PILLAR_Y+PILLAR_H+10} stroke="#ff00aa" strokeDasharray="3 2" />
            {/* Clearance guide */}
            <line x1={HEAD_CX + PILLAR_W/2} y1={PILLAR_MID_Y} x2={HEAD_CX + PILLAR_W/2 + LATERAL_CLEAR} y2={PILLAR_MID_Y} stroke="#00e0ff" />
            <line x1={HEAD_CX - PILLAR_W/2} y1={PILLAR_MID_Y} x2={HEAD_CX - PILLAR_W/2 - LATERAL_CLEAR} y2={PILLAR_MID_Y} stroke="#00e0ff" />
            <text x={HEAD_CX + PILLAR_W/2 + LATERAL_CLEAR/2} y={PILLAR_MID_Y - 4} textAnchor="middle" fill="#00e0ff">clear</text>
            {/* Head gap */}
            <line x1={HEAD_CX} y1={PILLAR_Y} x2={HEAD_CX} y2={HEAD_CY + HEAD_R} stroke="#ffaa00" strokeDasharray="2 2" />
            <text x={HEAD_CX + 4} y={(PILLAR_Y + (HEAD_CY + HEAD_R))/2} fill="#ffaa00">gap</text>
            {/* Golden annotations */}
            <text x={HEAD_CX + RX_OUTER + 4} y={PILLAR_MID_Y - RY_OUTER + 10} fill="#999">φ≈{PHI.toFixed(3)}</text>
            {metrics && (
              <g>
                <text x={HEAD_CX + RX_OUTER + 4} y={PILLAR_MID_Y - RY_OUTER + 22} fill="#0ff">mid clr {metrics.actualMidClearance.toFixed(1)}</text>
                <text x={HEAD_CX + RX_OUTER + 4} y={PILLAR_MID_Y - RY_OUTER + 32} fill="#0ff">target {metrics.lateralClearTarget.toFixed(1)}</text>
                <text x={HEAD_CX + RX_OUTER + 4} y={PILLAR_MID_Y - RY_OUTER + 42} fill="#0ff">Δφ {metrics.phiDeviation.toFixed(1)}</text>
              </g>
            )}
          </g>
        )}
      </g>
    </svg>
  );

  const didLogRef = useRef(false);
  const lastHashRef = useRef<string | null>(null);
  useEffect(() => {
    // Stable hash of metrics values to avoid redundant callback/log in StrictMode double render
    const hash = JSON.stringify(metrics);
    if (hash !== lastHashRef.current) {
      lastHashRef.current = hash;
      if (onMetrics) onMetrics(metrics);
      if (logMetrics && !didLogRef.current) {
        // eslint-disable-next-line no-console
        console.log('[LogoHumanAI metrics]', metrics);
        didLogRef.current = true;
      }
    }
  }, [metrics, logMetrics, onMetrics]);

  const wordmark = withWordmark && !embedWordmark && (
    <div className="logo-wordmark" aria-hidden="true" style={!lockWordmarkSpacing && wordmarkOffset != null ? { marginTop: wordmarkOffset } : undefined}>
      <div className="logo-wordmark__primary">
        <span className="logo-wordmark__human" style={{ color: wordColor }}>Human</span>
        <span className="logo-wordmark__ai" style={{ color: aiAccent }}>AI</span>
      </div>
      {showConvention && (
        <div className="logo-wordmark__convention">Convention</div>
      )}
    </div>
  );

  return (
    <div className={`logo-humanai logo-humanai--precise ${stacked ? 'logo-humanai--stacked' : ''} ${className} variant-${variant}`.trim()}>
      {mark}
      {wordmark}
    </div>
  );
};

export default LogoHumanAI;