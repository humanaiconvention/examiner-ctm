#!/usr/bin/env node
/*
 Unpack a solution zip into a diff-friendly folder using pac solution unpack.
 Expects: PP_SOLUTION_ZIP (path to zip) and PP_UNPACK_OUT (folder to receive unpack)
*/
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, basename } from 'node:path';

function run(cmd) {
  console.log(`$ ${cmd}`);
  return execSync(cmd, { stdio: 'inherit' });
}

function main() {
  const zip = process.env.PP_SOLUTION_ZIP;
  if (!zip) { console.error('Missing PP_SOLUTION_ZIP'); process.exit(1); }
  const out = process.env.PP_UNPACK_OUT || `powerplatform/solutions/${basename(zip).replace(/\.zip$/i,'')}`;
  mkdirSync(out, { recursive: true });
  // pac solution unpack --zipFile <zip> --folder <out>
  run(`pac solution unpack --zipFile "${zip}" --folder "${out}" --use-source-control`);
  console.log(`Unpacked to ${out}`);
}
main();
