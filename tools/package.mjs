#!/usr/bin/env node
// Packs templates into dist/<docFormat>-<id>@<version>.zip: manifest.json
// first, then manifest.files in order. Every file is re-hashed while packing;
// a mismatch stops instead of shipping something the manifest does not
// describe. With --changed-only, versions already in catalog/catalog.v1.json
// with the same content and license are skipped.
//
//   node tools/package.mjs [--out dist] [--changed-only] [<docFormat>/<id> ...]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  REPO_ROOT,
  ToolError,
  listTemplateDirs,
  parseArgs,
  readJson,
  rel,
  releaseHashes,
  run,
  sha256,
  zipName,
} from './lib/common.mjs';
import { buildZip } from './lib/zip.mjs';

function released() {
  const file = path.join(REPO_ROOT, 'catalog', 'catalog.v1.json');
  if (!existsSync(file)) return new Set();
  return new Set(
    readJson(file).templates.map(t => `${t.docFormat}/${t.id}@${t.version}:${t.contentSha256}:${t.licenseSha256}`)
  );
}

run(async () => {
  const { options, rest } = parseArgs(process.argv.slice(2), {
    out: 'string',
    'changed-only': 'boolean',
  });
  const out = path.resolve(options.out ?? path.join(REPO_ROOT, 'dist'));
  const skip = options['changed-only'] ? released() : new Set();
  const dirs = rest.length ? rest.map(arg => path.resolve(arg)) : listTemplateDirs();
  mkdirSync(out, { recursive: true });
  let packed = 0;
  for (const dir of dirs) {
    const manifestBytes = readFileSync(path.join(dir, 'manifest.json'));
    const manifest = JSON.parse(manifestBytes.toString('utf8'));
    if (manifest.withdrawn) continue;
    const hashes = releaseHashes(manifest);
    if (skip.has(`${manifest.docFormat}/${manifest.id}@${manifest.version}:${hashes.content}:${hashes.license}`)) continue;
    const entries = [{ name: 'manifest.json', data: manifestBytes }];
    for (const file of manifest.files) {
      const data = readFileSync(path.join(dir, file.path));
      if (sha256(data) !== file.sha256 || data.length !== file.bytes)
        throw new ToolError(`${rel(dir)}: ${file.path} does not match manifest.json; run tools/update-hashes.mjs and validate`);
      entries.push({ name: file.path, data });
    }
    const zip = buildZip(entries);
    writeFileSync(path.join(out, zipName(manifest)), zip);
    console.log(`packed ${zipName(manifest)} (${zip.length} bytes, ${entries.length} entries)`);
    packed++;
  }
  console.log(`${packed} template(s) packed into ${rel(out)}`);
});
