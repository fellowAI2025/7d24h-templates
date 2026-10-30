#!/usr/bin/env node
// Signs catalog/catalog.v1.json with ed25519 over its exact bytes and writes
// catalog/catalog.v1.json.sig (base64). The private key comes only from the
// CATALOG_SIGNING_KEY environment variable (PKCS#8 PEM, a CI secret). The
// desktop app ships the public key and ignores a catalog that fails to
// verify.
//
//   CATALOG_SIGNING_KEY="$(cat key.pem)" node tools/sign.mjs
//   node tools/sign.mjs --verify [--public-key catalog/catalog-signing.pub.pem]
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { REPO_ROOT, ToolError, parseArgs, rel, run } from './lib/common.mjs';

const CATALOG = path.join(REPO_ROOT, 'catalog', 'catalog.v1.json');
const SIGNATURE = `${CATALOG}.sig`;
const PUBLIC_KEY = path.join(REPO_ROOT, 'catalog', 'catalog-signing.pub.pem');

run(async () => {
  const { options } = parseArgs(process.argv.slice(2), {
    verify: 'boolean',
    'public-key': 'string',
  });
  const catalog = readFileSync(CATALOG);
  if (options.verify) {
    const key = createPublicKey(readFileSync(options['public-key'] ?? PUBLIC_KEY));
    const signature = Buffer.from(readFileSync(SIGNATURE, 'utf8').trim(), 'base64');
    if (!verify(null, catalog, key, signature)) throw new ToolError(`${rel(SIGNATURE)}: does not verify`);
    console.log(`${rel(SIGNATURE)}: verifies`);
    return;
  }
  const pem = process.env.CATALOG_SIGNING_KEY;
  if (!pem) throw new ToolError('CATALOG_SIGNING_KEY is not set');
  const key = createPrivateKey(pem);
  if (key.asymmetricKeyType !== 'ed25519') throw new ToolError('CATALOG_SIGNING_KEY must be an ed25519 key');
  writeFileSync(SIGNATURE, `${sign(null, catalog, key).toString('base64')}\n`);
  console.log(`signed ${rel(CATALOG)}`);
});
