#!/usr/bin/env node
// Creates the catalog signing key pair once. The private key is written
// outside the repository (mode 0600) to be stored as the CATALOG_SIGNING_KEY
// secret and then deleted locally; the public key goes to
// catalog/catalog-signing.pub.pem and into the desktop app.
//
//   node tools/keygen.mjs --out ~/catalog-signing.key.pem
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { REPO_ROOT, ToolError, parseArgs, rel, run } from './lib/common.mjs';

run(async () => {
  const { options } = parseArgs(process.argv.slice(2), { out: 'string' });
  if (!options.out) throw new ToolError('--out <private key file outside the repository> is required');
  const out = path.resolve(options.out);
  if (!path.relative(REPO_ROOT, out).startsWith('..'))
    throw new ToolError('the private key must not be written inside the repository');
  if (existsSync(out)) throw new ToolError(`${out} exists; not overwriting a key`);
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  writeFileSync(out, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  const pub = path.join(REPO_ROOT, 'catalog', 'catalog-signing.pub.pem');
  mkdirSync(path.dirname(pub), { recursive: true });
  writeFileSync(pub, publicKey.export({ type: 'spki', format: 'pem' }));
  const raw = publicKey.export({ format: 'jwk' }).x;
  console.log(`private key: ${out} (store it as the CATALOG_SIGNING_KEY secret, then delete it)`);
  console.log(`public key:  ${rel(pub)} (raw, base64url: ${raw})`);
});
