#!/usr/bin/env node
// Downloads every officialFiles entry from its official address and compares
// it with the recorded hash. A difference means either the venue released a
// new version (review it, add a new template version) or the recorded file
// is not the official one. Needs network; run on a schedule, not per PR.
// An address `<archive url>#<member>` names one file inside a .zip the venue
// publishes (NeurIPS, ICML, CTAN install/*.tds.zip) or inside a TeX Live
// .tar.xz package (packages CTAN ships only as .dtx, e.g. acmart).
//
//   node tools/check-official.mjs [typage/<id> ...]
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { listTemplateDirs, readJson, rel, run, sha256 } from './lib/common.mjs';
import { readZipEntry } from './lib/zip.mjs';

const archives = new Map();

async function download(url) {
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function readTarXzEntry(archive, member) {
  const result = spawnSync('tar', ['-xJOf', '-', member], { input: archive, maxBuffer: 256 * 1024 * 1024 });
  return result.status === 0 ? result.stdout : null;
}

async function officialBytes(address) {
  const hash = address.indexOf('#');
  if (hash < 0) return download(address);
  const url = address.slice(0, hash);
  if (!archives.has(url)) archives.set(url, download(url));
  const member = decodeURIComponent(address.slice(hash + 1));
  const archive = await archives.get(url);
  const data = /\.tar\.xz$/.test(url) ? readTarXzEntry(archive, member) : readZipEntry(archive, member);
  if (!data) throw new Error(`${member} is not in ${url}`);
  return data;
}

run(async () => {
  const dirs = process.argv.length > 2
    ? process.argv.slice(2).map(arg => path.resolve(arg))
    : listTemplateDirs(['typage']);
  let failed = 0;
  let checked = 0;
  for (const dir of dirs) {
    const typage = readJson(path.join(dir, 'typage.json'));
    for (const file of typage.officialFiles) {
      checked++;
      try {
        const actual = sha256(await officialBytes(file.officialUrl));
        if (actual === file.sha256) {
          console.log(`ok    ${rel(dir)}: ${file.path} (${file.officialVersion})`);
        } else {
          failed++;
          console.error(`DIFF  ${rel(dir)}: ${file.path} at ${file.officialUrl} is ${actual}, recorded ${file.sha256}`);
        }
      } catch (error) {
        failed++;
        console.error(`FAIL  ${rel(dir)}: ${file.path}: ${file.officialUrl}: ${error.message}`);
      }
    }
  }
  console.log(`${checked - failed}/${checked} official file(s) match their official address`);
  if (failed) process.exitCode = 1;
});
