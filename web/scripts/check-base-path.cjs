const fs = require('fs');
const path = require('path');

const distIndex = path.join(process.cwd(), 'web', 'dist', 'index.html');
if (!fs.existsSync(distIndex)) {
  console.error('dist/index.html not found — make sure you ran the build');
  process.exit(0);
}
const html = fs.readFileSync(distIndex, 'utf8');
// Detect occurrences of "/<repo>/assets" which indicate repo-base prefixes
const repoName = 'humanaiconvention';
const bad = new RegExp(`/${repoName}/assets`);
if (bad.test(html)) {
  console.error(`Found repo-base asset paths (/${repoName}/assets) in dist/index.html — this will break custom-domain Pages hosting.`);
  process.exit(2);
}
console.log('No repo-base prefixes found in dist/index.html');
process.exit(0);
