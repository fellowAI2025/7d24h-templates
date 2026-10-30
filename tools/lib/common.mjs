// Shared helpers for the 7d24h-templates tools. Node >= 22, no dependencies.
import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOOLS_VERSION = '1.0.0';
export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);
export const DOC_FORMATS = ['spage', 'typage', 'mpage'];

/** Same compiler and bundle the desktop app pins (typage-compile-engine-runtime.ts). */
export const TECTONIC_VERSION = '0.17.0';
export const TECTONIC_BUNDLE = 'v33';
export const TECTONIC_BUNDLE_URL =
  'https://relay.fullyjustified.net/default_bundle_v33.tar';
export const TECTONIC_BUNDLE_DIGEST =
  '6ffe055852f8faf66c0acbe1a7fb27f87b869a90bad1204f3bf4d9683f597c7c';

/** Where released zips, previews and the signed catalog are downloaded from. */
export const REPOSITORY = 'fellowAI2025/7d24h-templates';
export const RELEASE_BASE = `https://github.com/${REPOSITORY}/releases/download`;
/** Static copy of the same files for users in China (files only, no pages). */
export const MIRROR_BASE = 'https://www.7d24h.work/downloads/templates';

/** Default per-template cap; a manifest `sizeApproval` may raise it to the hard cap. */
export const DEFAULT_MAX_TEMPLATE_BYTES = 64 * 1024 * 1024;
export const HARD_MAX_TEMPLATE_BYTES = 256 * 1024 * 1024;
export const MAX_TEMPLATE_FILES = 1500;

/**
 * Licenses that raise no warning. Advisory only (owner 10-30: each template
 * directory carries its own license file, which operators complete at any
 * time). The others are flagged for a look before release: GPL / LGPL / AGPL
 * and CC *-SA (copyleft), CC *-NC (7d24h is commercial), CC *-ND (users adapt
 * the sample), and files without any license (all rights reserved).
 */
export const RECOMMENDED_SPDX = new Set([
  'CC0-1.0',
  'CC-BY-4.0',
  'MIT',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  'LPPL-1.2',
  'LPPL-1.3a',
  'LPPL-1.3c',
  'OFL-1.1',
]);

/** License files of a template: its declared license file, LICENSE*, NOTICE*, LICENSES/. */
export function isLicensePath(manifest, file) {
  return (
    file === manifest.license?.file ||
    file.startsWith('LICENSES/') ||
    /^(?:LICEN[CS]E|COPYING|NOTICE)(?:[.-][A-Za-z0-9.-]+)?$/.test(file)
  );
}

/**
 * Two hashes of a template version: everything except licensing, and the
 * licensing alone. A released version's content never changes; its license
 * may be completed later and is then re-packed under the same version.
 */
export function releaseHashes(manifest) {
  const { license, files, ...rest } = manifest;
  const own = file => isLicensePath(manifest, file.path);
  return {
    content: sha256(JSON.stringify({ ...rest, files: files.filter(file => !own(file)) })),
    license: sha256(JSON.stringify({ license, files: files.filter(own) })),
  };
}

export class ToolError extends Error {}

export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function readJson(file) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    throw new ToolError(`${rel(file)}: cannot read`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ToolError(`${rel(file)}: invalid JSON (${error.message})`);
  }
}

/** Stable formatting for every JSON file the tools write. */
export function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** Calendar versions YYYY.M.N compared numerically; < 0 when a is older. */
export function compareVersions(a, b) {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

/** Released file name: <docFormat>-<id>@<version>.zip */
export function zipName(manifest) {
  return `${manifest.docFormat}-${manifest.id}@${manifest.version}.zip`;
}

export function rel(file) {
  return path.relative(REPO_ROOT, file) || '.';
}

/** Every template directory: <docFormat>/<id>/ with a manifest.json. */
export function listTemplateDirs(formats = DOC_FORMATS) {
  const dirs = [];
  for (const format of formats) {
    const root = path.join(REPO_ROOT, format);
    let names = [];
    try {
      names = readdirSync(root, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
        .map(entry => entry.name)
        .sort();
    } catch {
      continue;
    }
    for (const name of names) dirs.push(path.join(root, name));
  }
  return dirs;
}

/**
 * Files of a template directory, relative, sorted, '/'-separated. Symlinks and
 * dot files are reported as problems instead of being followed or skipped
 * silently; only Finder's .DS_Store (git-ignored) is skipped.
 */
export function walkTemplateFiles(dir) {
  const files = [];
  const problems = [];
  const visit = current => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      const relative = path.relative(dir, full).split(path.sep).join('/');
      if (entry.name === '.DS_Store') continue;
      if (entry.name.startsWith('.')) {
        problems.push(`${relative}: dot files are not allowed`);
        continue;
      }
      const stat = lstatSync(full);
      if (stat.isSymbolicLink()) {
        problems.push(`${relative}: symbolic links are not allowed`);
      } else if (stat.isDirectory()) {
        visit(full);
      } else if (stat.isFile()) {
        if (stat.mode & 0o111)
          problems.push(`${relative}: executable files are not allowed`);
        files.push({ path: relative, bytes: stat.size });
      } else {
        problems.push(`${relative}: not a regular file`);
      }
    }
  };
  visit(dir);
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files, problems };
}

/** Files that go into manifest.files: everything except manifest.json. */
export function hashTemplateFiles(dir) {
  const { files, problems } = walkTemplateFiles(dir);
  return {
    files: files
      .filter(file => file.path !== 'manifest.json')
      .map(file => ({
        path: file.path,
        sha256: sha256(readFileSync(path.join(dir, file.path))),
        bytes: file.bytes,
      })),
    problems,
  };
}

/** Ids of an `A AND B` expression, or null when it is not one. */
export function spdxIds(expression) {
  if (typeof expression !== 'string' || !expression.trim()) return null;
  const ids = expression.split(/\s+AND\s+/);
  for (const id of ids) {
    if (!/^(?:LicenseRef-[A-Za-z0-9.-]+|[A-Za-z0-9.+-]+)$/.test(id)) return null;
  }
  return ids;
}

export function parseArgs(argv, flags) {
  const options = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      rest.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (!(name in flags)) throw new ToolError(`unknown option --${name}`);
    if (flags[name] === 'boolean') options[name] = true;
    else {
      const value = argv[++i];
      if (value === undefined) throw new ToolError(`--${name} needs a value`);
      options[name] = value;
    }
  }
  return { options, rest };
}

export function run(main) {
  main().catch(error => {
    console.error(
      error instanceof ToolError ? `error: ${error.message}` : error
    );
    process.exitCode = 1;
  });
}
