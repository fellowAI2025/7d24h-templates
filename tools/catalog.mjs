#!/usr/bin/env node
// Regenerates catalog/catalog.v1.json, the one file the desktop app reads to
// list system templates. Released versions are immutable: a template whose
// version is already in the catalog must have the same content, otherwise
// bump its version. Only its license may change (operators complete it at
// any time, owner 10-30); the same version is then re-packed. New versions
// and license updates need their zip (and optional previews) in dist/,
// produced by package.mjs and the release workflow, and are recorded under
// --release-tag.
//
//   node tools/catalog.mjs --release-tag templates-YYYY.MM.DD [--dist dist]
//   node tools/catalog.mjs --check   (no new versions allowed; CI on PRs)
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import {
  DOC_FORMATS,
  MIRROR_BASE,
  RELEASE_BASE,
  REPO_ROOT,
  ToolError,
  compareVersions,
  listTemplateDirs,
  parseArgs,
  readJson,
  rel,
  releaseHashes,
  run,
  sha256,
  writeJson,
  zipName,
} from './lib/common.mjs';

const CATALOG = path.join(REPO_ROOT, 'catalog', 'catalog.v1.json');
const RELEASE_TAG = /^templates-\d{4}\.\d{2}\.\d{2}(?:\.\d+)?$/;

function previewsFor(dist, manifest) {
  const stem = zipName(manifest).replace(/\.zip$/, '');
  if (!existsSync(dist)) return null;
  const names = readdirSync(dist);
  const pages = names
    .filter(name => name.startsWith(`${stem}.page-`) && name.endsWith('.webp'))
    .sort((a, b) => Number(/page-(\d+)/.exec(a)[1]) - Number(/page-(\d+)/.exec(b)[1]));
  const thumb = `${stem}.thumb.webp`;
  if (!pages.length || !names.includes(thumb)) return null;
  return { thumb, pages };
}

function typageSummary(dir) {
  const typage = readJson(path.join(dir, 'typage.json'));
  return {
    kind: typage.kind,
    venue: typage.venue,
    engine: typage.engine.policy,
    switchable: typage.kind !== 'style-like',
    variants: typage.variants.map(variant => ({
      id: variant.id,
      label: variant.label,
      labelZh: variant.labelZh,
    })),
    pages: typage.verified?.pages ?? null,
    fields: typage.verified?.fieldsDetected ?? null,
    visualRaw: typage.verified?.visualRaw ?? null,
    officialFilesUnchanged: typage.verified?.officialFilesMatch ?? null,
  };
}

run(async () => {
  const { options } = parseArgs(process.argv.slice(2), {
    'release-tag': 'string',
    dist: 'string',
    check: 'boolean',
  });
  const tag = options['release-tag'];
  if (!options.check && !RELEASE_TAG.test(tag ?? ''))
    throw new ToolError('--release-tag templates-YYYY.MM.DD is required (or --check)');
  const dist = path.resolve(options.dist ?? path.join(REPO_ROOT, 'dist'));
  const previous = existsSync(CATALOG) ? readJson(CATALOG) : { templates: [] };
  const released = new Map(previous.templates.map(t => [`${t.docFormat}/${t.id}`, t]));
  const categories = readJson(path.join(REPO_ROOT, 'categories.json'));

  const templates = [];
  const pending = [];
  for (const dir of listTemplateDirs()) {
    const manifest = readJson(path.join(dir, 'manifest.json'));
    const key = `${manifest.docFormat}/${manifest.id}`;
    const hashes = releaseHashes(manifest);
    const old = released.get(key);
    let entry;
    const sameVersion = old?.version === manifest.version;
    if (sameVersion && old.contentSha256 !== hashes.content)
      throw new ToolError(`${rel(dir)}: ${manifest.version} is already released with other content; bump the version`);
    if (sameVersion && (old.licenseSha256 === hashes.license || manifest.withdrawn)) {
      entry = { ...old, withdrawn: manifest.withdrawn === true };
    } else {
      if (old && !sameVersion && compareVersions(manifest.version, old.version) <= 0)
        throw new ToolError(`${rel(dir)}: ${manifest.version} is not newer than released ${old.version}`);
      if (manifest.withdrawn) continue;
      pending.push(`${rel(dir)}${sameVersion ? ' (license update)' : ''}`);
      if (options.check) continue;
      const zipFile = path.join(dist, zipName(manifest));
      if (!existsSync(zipFile)) throw new ToolError(`${rel(dir)}: ${rel(zipFile)} missing; run tools/package.mjs`);
      const zip = readFileSync(zipFile);
      entry = {
        docFormat: manifest.docFormat,
        id: manifest.id,
        version: manifest.version,
        name: manifest.name,
        nameZh: manifest.nameZh,
        category: manifest.category,
        tags: manifest.tags,
        description: manifest.description,
        descriptionZh: manifest.descriptionZh,
        license: manifest.license.spdx,
        minAppVersion: manifest.minAppVersion,
        withdrawn: false,
        contentSha256: hashes.content,
        licenseSha256: hashes.license,
        releaseTag: tag,
        files: manifest.files.length + 1,
        bytes: zip.length,
        sha256: sha256(zip),
        zip: `${RELEASE_BASE}/${tag}/${zipName(manifest)}`,
        mirrorZip: `${MIRROR_BASE}/${tag}/${zipName(manifest)}`,
        // Preview images sit next to the zip in the release and on the mirror.
        previews: previewsFor(dist, manifest),
      };
      if (manifest.docFormat === 'typage') entry.typage = typageSummary(dir);
    }
    templates.push(entry);
  }

  if (options.check) {
    console.log(pending.length ? `to release: ${pending.join(', ')}` : 'nothing to release');
    return;
  }
  const order = new Map();
  for (const format of DOC_FORMATS)
    categories[format].forEach((category, i) => order.set(`${format}/${category.id}`, i));
  templates.sort(
    (a, b) =>
      DOC_FORMATS.indexOf(a.docFormat) - DOC_FORMATS.indexOf(b.docFormat) ||
      order.get(`${a.docFormat}/${a.category}`) - order.get(`${b.docFormat}/${b.category}`) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
  mkdirSync(path.dirname(CATALOG), { recursive: true });
  writeJson(CATALOG, {
    schema: '7d24h-template-catalog/v1',
    generatedAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    categories: { spage: categories.spage, typage: categories.typage, mpage: categories.mpage },
    templates,
  });
  console.log(`${rel(CATALOG)}: ${templates.length} template(s), ${pending.length} released under ${tag}`);
});
