#!/usr/bin/env node
// Injects a minimal password gate into dist/index.html for ephemeral previews.
// NOT for production security. Purely a light obfuscation barrier.
// Usage: node scripts/preview-protect.mjs --password "$PREVIEW_PASSWORD" --dist dist/index.html
import fs from 'fs';

function args() {
  const a = process.argv.slice(2); const out = {}; for (let i=0;i<a.length;i++){const k=a[i]; if(k==='--password') out.password=a[++i]; else if(k==='--dist') out.dist=a[++i]; }
  return out;
}

const { password, dist } = args();
if(!password || !dist){
  console.error('Missing --password or --dist path');
  process.exit(1);
}
if(!fs.existsSync(dist)){
  console.error('Dist file not found:', dist); process.exit(2);
}
let html = fs.readFileSync(dist,'utf8');
if(html.includes('__PREVIEW_LOCK__')){
  console.log('Already protected.'); process.exit(0);
}

const esc = password.replace(/"/g,'\\"');
const gate = `\n<script id="__PREVIEW_LOCK__">(function(){try{var p=localStorage.getItem('preview_pass')||prompt('Preview Password');if(p!=="${esc}"){localStorage.removeItem('preview_pass');document.body.innerHTML='';throw new Error('Bad password');}localStorage.setItem('preview_pass',p);}catch(e){document.documentElement.innerHTML='<h1>Unauthorized</h1>';}})();</script>`;

if(/<body[^>]*>/i.test(html)){
  html = html.replace(/<body[^>]*>/i, m => m + gate);
} else if(/<head>/i.test(html)){
  html = html.replace(/<head>/i, '<head>'+gate);
} else {
  html = gate + html;
}
fs.writeFileSync(dist, html);
console.log('Password gate injected.');