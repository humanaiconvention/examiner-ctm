#!/usr/bin/env node
/**
 * Export the current parametric tapered HumanAI logo (inner span 132°) to SVG and PNG.
 * Requires: sharp (npm i -D sharp)
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

// Geometry parameters (mirroring LogoHumanAI defaults with overrides)
const verticalFactor = 1.0; // full height
const taperStrength = 1.0;  // maximum inward pinch
const taperEnabled = true;
const innerSpanDeg = 132;   // archived span

// We'll replicate only the parametric arc branch logic with same golden constants.
const PHI = (1 + Math.sqrt(5)) / 2;
const TRIM_TOP = 22;
const LEGACY_PILLAR_H = 212 - TRIM_TOP; // 190
const PILLAR_H = LEGACY_PILLAR_H * verticalFactor;
const HEAD_GAP = (PILLAR_H / 2) * (2 - PHI) / PHI;
const HEAD_DIAMETER = HEAD_GAP * PHI;
const HEAD_R = HEAD_DIAMETER / 2;
let PILLAR_W = HEAD_GAP / PHI; // initial
const outerR = PILLAR_H / 2;
const desiredClearance = HEAD_GAP / PHI;

function solve(pillarW){
  const half = pillarW / 2;
  const baseInnerMin = Math.max(half + desiredClearance, half + 1);
  const phiScale = 1 / (PHI * PHI);
  const targetFactor = 0.25;
  const thicknessFactor = (phiScale + targetFactor) / 2;
  let trialThickness = (outerR - baseInnerMin) * thicknessFactor;
  let trialInner = outerR - trialThickness;
  if (trialInner < baseInnerMin){ trialInner = baseInnerMin; trialThickness = outerR - trialInner; }
  return { innerR: trialInner, thickness: trialThickness };
}
let { innerR, thickness } = solve(PILLAR_W);
PILLAR_W = thickness;
({ innerR, thickness } = solve(PILLAR_W));
PILLAR_W = thickness;
let CENTERLINE_GAP = innerR;

const INNER_SPAN_DEG = innerSpanDeg;
const deg = d => d * Math.PI/180;
const innerMid = deg(90);
const innerStart = deg(90 - INNER_SPAN_DEG/2);
const innerEnd = deg(90 + INNER_SPAN_DEG/2);

const sinInnerStart = Math.sin(innerStart);
const sinOuterStart = sinInnerStart * (innerR / outerR);
const outerStart = Math.asin(Math.min(1, Math.max(-1, sinOuterStart)));
const outerEnd = Math.PI - outerStart;

const PILLAR_MID_Y = TRIM_TOP + PILLAR_H / 2;
const HEAD_CX = 100; // base center (we keep 200 width like original viewBox start)
const HEAD_CY = TRIM_TOP - HEAD_GAP - HEAD_R;
const VIEWBOX_WIDTH = 200;
const RY_OUTER = PILLAR_H / 2;
const topVisible = PILLAR_MID_Y - RY_OUTER;
const bottomVisible = PILLAR_MID_Y + RY_OUTER;
const OFFSET_Y = 0;
const VIEWBOX_HEIGHT = (bottomVisible - topVisible) + OFFSET_Y + 16;

const polar = (r,a)=> ({ x: HEAD_CX + r * Math.sin(a), y: PILLAR_MID_Y - r * Math.cos(a) });
const polarL = (r,a)=> ({ x: HEAD_CX - r * Math.sin(a), y: PILLAR_MID_Y - r * Math.cos(a) });
const oS = polar(outerR, outerStart); const oM = polar(outerR, innerMid); const oE = polar(outerR, outerEnd);
const loS = polarL(outerR, outerStart); const loM = polarL(outerR, innerMid); const loE = polarL(outerR, outerEnd);

// Taper
const strength = taperEnabled ? taperStrength : 0;
let rightPath, leftPath;
if (!taperEnabled || strength === 0){
  const iS = polar(innerR, innerStart), iM = polar(innerR, innerMid), iE = polar(innerR, innerEnd);
  const liS = polarL(innerR, innerStart), liM = polarL(innerR, innerMid), liE = polarL(innerR, innerEnd);
  rightPath = [
    `M ${oS.x} ${oS.y}`,
    `A ${outerR} ${outerR} 0 0 1 ${oM.x} ${oM.y}`,
    `A ${outerR} ${outerR} 0 0 1 ${oE.x} ${oE.y}`,
    `L ${iE.x} ${iE.y}`,
    `A ${innerR} ${innerR} 0 0 0 ${iM.x} ${iM.y}`,
    `A ${innerR} ${innerR} 0 0 0 ${iS.x} ${iS.y}`,
    'Z'
  ].join(' ');
  leftPath = [
    `M ${loS.x} ${loS.y}`,
    `A ${outerR} ${outerR} 0 0 0 ${loM.x} ${loM.y}`,
    `A ${outerR} ${outerR} 0 0 0 ${loE.x} ${loE.y}`,
    `L ${liE.x} ${liE.y}`,
    `A ${innerR} ${innerR} 0 0 1 ${liM.x} ${liM.y}`,
    `A ${innerR} ${innerR} 0 0 1 ${liS.x} ${liS.y}`,
    'Z'
  ].join(' ');
} else {
  const targetRatio = PHI;
  const ratio = 1 + (targetRatio - 1) * strength;
  const baseThickness = outerR - innerR;
  const minThickness = baseThickness / ratio;
  const SAMPLES = 48;
  const halfSpan = innerEnd - innerMid;
  const innerPtsR = [], innerPtsL = [];
  for (let i=0;i<=SAMPLES;i++){
    const theta = innerEnd - (innerEnd - innerStart)*(i/SAMPLES);
    const u = (theta - innerMid)/halfSpan; // -1..1
    const w = u*u; // 0 mid,1 ends
    const tLocal = minThickness + (baseThickness - minThickness) * w;
    const rInnerLocal = outerR - tLocal;
    innerPtsR.push(polar(rInnerLocal, theta));
    innerPtsL.push(polarL(rInnerLocal, theta));
  }
  rightPath = [
    `M ${oS.x} ${oS.y}`,
    `A ${outerR} ${outerR} 0 0 1 ${oM.x} ${oM.y}`,
    `A ${outerR} ${outerR} 0 0 1 ${oE.x} ${oE.y}`,
    `L ${innerPtsR[0].x} ${innerPtsR[0].y}`,
    ...innerPtsR.slice(1).map(p=>`L ${p.x} ${p.y}`),
    'Z'
  ].join(' ');
  leftPath = [
    `M ${loS.x} ${loS.y}`,
    `A ${outerR} ${outerR} 0 0 0 ${loM.x} ${loM.y}`,
    `A ${outerR} ${outerR} 0 0 0 ${loE.x} ${loE.y}`,
    `L ${innerPtsL[0].x} ${innerPtsL[0].y}`,
    ...innerPtsL.slice(1).map(p=>`L ${p.x} ${p.y}`),
    'Z'
  ].join(' ');
}

// Pillar (tapered)
const targetRatio = PHI;
const ratio = 1 + (targetRatio - 1) * strength;
const midW = PILLAR_W / ratio;
const samples = 24;
const left = [], right = [];
for (let i=0;i<=samples;i++){
  const t = i / samples;
  const y = TRIM_TOP + PILLAR_H * t;
  const v = (y - PILLAR_MID_Y) / (PILLAR_H/2);
  const w = v*v;
  const widthHere = midW + (PILLAR_W - midW) * w;
  const halfW = widthHere / 2;
  left.push({ x: HEAD_CX - halfW, y });
  right.push({ x: HEAD_CX + halfW, y });
}
function catmull(p0,p1,p2,p3){ const s=1/6; return { c1x: p1.x+(p2.x-p0.x)*s, c1y:p1.y+(p2.y-p0.y)*s, c2x:p2.x-(p3.x-p1.x)*s, c2y:p2.y-(p3.y-p1.y)*s }; }
const pillarPath = [];
pillarPath.push(`M ${right[0].x} ${right[0].y}`);
for (let i=0;i<right.length-1;i++){ const p0=right[i===0?0:i-1],p1=right[i],p2=right[i+1],p3=right[i+2<right.length?i+2:i+1]; const {c1x,c1y,c2x,c2y}=catmull(p0,p1,p2,p3); pillarPath.push(`C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`);} 
const bottomLeft = left[left.length-1]; pillarPath.push(`L ${bottomLeft.x} ${bottomLeft.y}`);
for (let i=left.length-1;i>0;i--){ const p0=left[i+1>left.length-1?left.length-1:i+1],p1=left[i],p2=left[i-1],p3=left[i-2<0?0:i-2]; const {c1x,c1y,c2x,c2y}=catmull(p0,p1,p2,p3); pillarPath.push(`C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`);} pillarPath.push('Z');

const fg = '#ffffff';
const secondary = '#ffffff';
const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg viewBox="0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}" xmlns="http://www.w3.org/2000/svg" fill="none" shape-rendering="geometricPrecision">\n<title>HumanAI Logo (parametric span132 taper1)</title>\n<circle cx="${HEAD_CX}" cy="${HEAD_CY}" r="${HEAD_R}" fill="${fg}"/>\n<path d="${pillarPath.join(' ')}" fill="${fg}"/>\n<path d="${leftPath}" fill="${secondary}"/>\n<path d="${rightPath}" fill="${secondary}"/>\n</svg>\n`;

const outDir = path.resolve('public');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const svgPath = path.join(outDir, 'logo-humanai-span132.svg');
const pngPath = path.join(outDir, 'logo-humanai-span132.png');
fs.writeFileSync(svgPath, svg, 'utf8');
console.log('[export] Wrote SVG', svgPath);

await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(pngPath);
console.log('[export] Wrote PNG', pngPath);
