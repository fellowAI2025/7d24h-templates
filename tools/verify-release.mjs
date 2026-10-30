#!/usr/bin/env node
// Checks a downloaded release before it is copied to the mirror: the catalog
// verifies against catalog/catalog-signing.pub.pem, and every template the
// catalog says was released under <tag> has its zip (same size and SHA-256)
// and preview images in the directory. The mirror then holds exactly the
// bytes the desktop app will accept from GitHub.
//
//   gh release download <tag> --dir out
//   node tools/verify-release.mjs --dir out --tag <tag>
import { createPublicKey, verify } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { REPO_ROOT, ToolError, parseArgs, run, sha256 } from './lib/common.mjs';

const PUBLIC_KEY = path.join(REPO_ROOT, 'catalog', 'catalog-signing.pub.pem');

run(async () => {
  const { options } = parseArgs(process.argv.slice(2), { dir: 'string', tag: 'string' });
  if (!options.dir || !options.tag) throw new ToolError('--dir <downloaded release> and --tag <release tag> are required');
  const dir = path.resolve(options.dir);
  const catalogFile = path.join(dir, 'catalog.v1.json');
  const bytes = readFileSync(catalogFile);
  const signature = Buffer.from(readFileSync(`${catalogFile}.sig`, 'utf8').trim(), 'base64');
  if (!verify(null, bytes, createPublicKey(readFileSync(PUBLIC_KEY)), signature))
    throw new ToolError('catalog.v1.json.sig does not verify against catalog/catalog-signing.pub.pem');
  const catalog = JSON.parse(bytes.toString('utf8'));
  const released = catalog.templates.filter(t => t.releaseTag === options.tag);
  if (!released.length) throw new ToolError(`the catalog lists no template released under ${options.tag}`);
  const problems = [];
  for (const entry of released) {
    const name = path.basename(new URL(entry.zip).pathname);
    const file = path.join(dir, name);
    if (!existsSync(file)) {
      problems.push(`${name}: missing`);
      continue;
    }
    const zip = readFileSync(file);
    if (zip.length !== entry.bytes || sha256(zip) !== entry.sha256)
      problems.push(`${name}: size or SHA-256 differs from the catalog`);
    for (const preview of entry.previews ? [entry.previews.thumb, ...entry.previews.pages] : [])
      if (!existsSync(path.join(dir, preview))) problems.push(`${preview}: missing`);
  }
  if (problems.length) throw new ToolError(problems.join('\n'));
  console.log(`${options.tag}: catalog verifies; ${released.length} zip(s) and their previews match`);
});
