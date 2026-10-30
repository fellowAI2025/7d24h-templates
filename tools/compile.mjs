#!/usr/bin/env node
// Compiles each Typage template with the built-in Tectonic only (no system
// TeX): a first pass may fetch bundle v33 files into the cache, a second pass
// must succeed with --only-cached, the way the desktop app runs it.
//
//   node tools/compile.mjs --tectonic <path> --cache <dir>
//        [--write-verified] [--pdf-out <dir>] [--offline] [typage/<id> ...]
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  TECTONIC_BUNDLE,
  TECTONIC_BUNDLE_DIGEST,
  TECTONIC_BUNDLE_URL,
  TECTONIC_VERSION,
  TOOLS_VERSION,
  ToolError,
  hashTemplateFiles,
  listTemplateDirs,
  parseArgs,
  readJson,
  rel,
  run,
  sha256,
  writeJson,
} from './lib/common.mjs';
import { applyVariant, findRegion } from './lib/region.mjs';

const LOG_PROBLEMS = [
  /There were undefined (?:references|citations)/,
  /(?:Citation|Reference) [`'][^']*' (?:on page \d+ )?undefined/,
  /Package natbib Warning: Citation/,
  /I couldn't open (?:file|database file|style file)/,
  /Warning--I didn't find a database entry/,
];

function tectonic(bin, cache, args, cwd) {
  const result = spawnSync(bin, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, TECTONIC_CACHE_DIR: cache },
    maxBuffer: 64 * 1024 * 1024,
    timeout: 10 * 60 * 1000,
  });
  return { ok: result.status === 0, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

/**
 * Two passes like the desktop app: the first may fetch bundle files into the
 * cache, the second must succeed with --only-cached. Returns pages and PDF.
 */
function build(dir, src, out, entry, options, label) {
  // Same flags as the desktop app (main/handlers.ts): with --keep-logs alone
  // Tectonic drops main.log for some classes (acmart 2.20).
  const base = ['--untrusted', '--keep-logs', '--keep-intermediates', '--bundle', TECTONIC_BUNDLE_URL];
  if (!options.offline) {
    const first = tectonic(options.tectonic, options.cache, [...base, '--outdir', mkOut(`${out}-fetch`), entry], src);
    if (!first.ok) throw new ToolError(`${rel(dir)}${label}: compile failed\n${tail(first.output)}`);
  }
  const second = tectonic(options.tectonic, options.cache, ['--only-cached', ...base, '--outdir', mkOut(out), entry], src);
  if (!second.ok) throw new ToolError(`${rel(dir)}${label}: offline (--only-cached) compile failed\n${tail(second.output)}`);

  const stem = path.basename(entry, '.tex');
  const log = readFileSync(path.join(out, `${stem}.log`), 'utf8');
  const blg = existsSync(path.join(out, `${stem}.blg`)) ? readFileSync(path.join(out, `${stem}.blg`), 'utf8') : '';
  for (const pattern of LOG_PROBLEMS) {
    const hit = pattern.exec(`${log}\n${blg}`);
    if (hit) throw new ToolError(`${rel(dir)}${label}: ${hit[0]}`);
  }
  const pages = Number(/Output written on .*?\((\d+) pages?/.exec(log)?.[1] ?? 0);
  const pdf = path.join(out, `${stem}.pdf`);
  if (!pages || !existsSync(pdf)) throw new ToolError(`${rel(dir)}${label}: no PDF output`);
  return { pages, pdf };
}

function compileTemplate(dir, options) {
  const manifest = readJson(path.join(dir, 'manifest.json'));
  const typage = readJson(path.join(dir, 'typage.json'));
  const work = mkdtempSync(path.join(os.tmpdir(), `tpl-${manifest.id}-`));
  try {
    const src = path.join(work, 'src');
    for (const file of manifest.files) {
      if (file.path === 'typage.json') continue;
      const target = path.join(src, file.path);
      mkdirSync(path.dirname(target), { recursive: true });
      copyFileSync(path.join(dir, file.path), target);
    }
    const { pages, pdf } = build(dir, src, path.join(work, 'out'), typage.entry, options, '');

    // Every other variant must compile too (written next to the entry so
    // relative \input and \bibliography paths still resolve).
    const entryText = readFileSync(path.join(src, typage.entry), 'utf8');
    const current = findRegion(entryText)?.variant;
    for (const variant of typage.variants.filter(item => item.id !== current)) {
      const entry = path.join(path.dirname(typage.entry), `variant-${variant.id}.tex`);
      writeFileSync(path.join(src, entry), applyVariant(entryText, typage, variant));
      build(dir, src, path.join(work, `out-${variant.id}`), entry, options, ` variant ${variant.id}`);
    }

    // Official files, shipped or taken from the bundle, must be the official bytes.
    for (const file of typage.officialFiles) {
      const used = file.inBundle
        ? path.join(options.cache, 'bundles', 'data', TECTONIC_BUNDLE_DIGEST, path.basename(file.path))
        : path.join(dir, file.path);
      if (!existsSync(used)) throw new ToolError(`${rel(dir)}: ${file.path} was not ${file.inBundle ? 'taken from the bundle' : 'shipped'}`);
      if (sha256(readFileSync(used)) !== file.sha256)
        throw new ToolError(`${rel(dir)}: ${file.inBundle ? 'bundle copy of ' : ''}${file.path} differs from the recorded official hash`);
    }

    if (options['pdf-out']) {
      mkdirSync(options['pdf-out'], { recursive: true });
      copyFileSync(pdf, path.join(options['pdf-out'], `${manifest.docFormat}-${manifest.id}@${manifest.version}.pdf`));
    }
    if (options['write-verified']) {
      typage.verified = {
        compiler: `tectonic ${TECTONIC_VERSION} / bundle ${TECTONIC_BUNDLE}`,
        systemTex: false,
        // Checked above; check-official.mjs keeps the recorded hashes honest
        // against the official addresses.
        officialFilesMatch: typage.officialFiles.length ? true : null,
        pages,
        visualRaw: typage.verified?.visualRaw ?? null,
        fieldsDetected: typage.verified?.fieldsDetected ?? null,
        at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
        by: `7d24h-templates/tools ${TOOLS_VERSION}`,
      };
      writeJson(path.join(dir, 'typage.json'), typage);
      manifest.files = hashTemplateFiles(dir).files;
      writeJson(path.join(dir, 'manifest.json'), manifest);
    } else if (typage.verified && typage.verified.pages !== pages) {
      throw new ToolError(`${rel(dir)}: ${pages} pages, typage.json verified ${typage.verified.pages}`);
    }
    return pages;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function mkOut(dir) {
  mkdirSync(dir, { recursive: true });
  return dir;
}

function tail(text) {
  return text.trim().split('\n').slice(-40).join('\n');
}

run(async () => {
  const { options, rest } = parseArgs(process.argv.slice(2), {
    tectonic: 'string',
    cache: 'string',
    'write-verified': 'boolean',
    'pdf-out': 'string',
    offline: 'boolean',
  });
  options.tectonic ??= process.env.TECTONIC ?? 'tectonic';
  options.cache ??= process.env.TECTONIC_CACHE_DIR;
  if (!options.cache) throw new ToolError('--cache (or TECTONIC_CACHE_DIR) is required');
  options.cache = path.resolve(options.cache);
  const version = spawnSync(options.tectonic, ['--version'], { encoding: 'utf8' });
  if (!version.stdout?.includes(`Tectonic ${TECTONIC_VERSION}`))
    throw new ToolError(`need Tectonic ${TECTONIC_VERSION}, got ${version.stdout?.trim() || version.error?.message}`);

  const dirs = rest.length ? rest.map(arg => path.resolve(arg)) : listTemplateDirs(['typage']);
  let failed = 0;
  for (const dir of dirs) {
    try {
      const pages = compileTemplate(dir, options);
      console.log(`ok    ${rel(dir)} (${pages} pages)`);
    } catch (error) {
      failed++;
      console.error(error instanceof ToolError ? `FAIL  ${error.message}` : error);
    }
  }
  console.log(`${dirs.length - failed}/${dirs.length} compiled with Tectonic ${TECTONIC_VERSION} / bundle ${TECTONIC_BUNDLE}`);
  if (failed) process.exitCode = 1;
});
