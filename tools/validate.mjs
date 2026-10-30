#!/usr/bin/env node
// Checks every template (or the given template directories) without network
// or TeX: schema, ids, file list and hashes, licenses, size caps, official
// files, template-region markers and forbidden content.
//
//   node tools/validate.mjs [typage/<id> ...]
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  DEFAULT_MAX_TEMPLATE_BYTES,
  HARD_MAX_TEMPLATE_BYTES,
  MAX_TEMPLATE_FILES,
  RECOMMENDED_SPDX,
  REPO_ROOT,
  hashTemplateFiles,
  listTemplateDirs,
  readJson,
  rel,
  run,
  spdxIds,
} from './lib/common.mjs';
import { applyVariant, classLine, packageLine, switchedBy } from './lib/region.mjs';
import { CATEGORIES, MANIFEST, TYPAGE, validateShape } from './lib/schema.mjs';

const TEXT_FILE = /\.(?:tex|ltx|sty|cls|clo|def|cfg|fd|bst|bib|bbx|cbx|lbx|dbx|rtx|dtx|ins)$/i;
const FORBIDDEN = [
  [/\\write\s*18/, '\\write18'],
  [/\\directlua/, '\\directlua'],
  [/\\ShellEscape/, '\\ShellEscape'],
  [/shell-?escape/i, 'shell-escape'],
  [/\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\])?\s*\{[^}]*\b(?:minted|shellesc|pythontex)\b/, 'a package that needs shell-escape'],
  [/\\(?:input|include|InputIfFileExists|includegraphics)\s*(?:\[[^\]]*\])?\s*\{\s*(?:\/|~|[A-Za-z]:[\\/]|https?:)/, 'an absolute path or URL'],
];

function loadCategories() {
  const file = path.join(REPO_ROOT, 'categories.json');
  const categories = readJson(file);
  const errors = validateShape(categories, CATEGORIES, 'categories.json');
  return { categories, errors };
}

/**
 * Advisory only: the template's own license file and summary are written and
 * completed by operators (owner 10-30), so nothing here fails a check.
 */
function checkLicense(dir, manifest, warnings) {
  const { license } = manifest;
  if (!license.file) warnings.push('license.file: no license file named yet');
  else if (!existsSync(path.join(dir, license.file)))
    warnings.push(`license.file ${license.file}: not in the template directory`);
  if (!license.spdx) return void warnings.push('license.spdx: not filled in yet');
  const ids = spdxIds(license.spdx);
  if (!ids) return void warnings.push(`license.spdx: "${license.spdx}" is not an "A AND B" SPDX expression`);
  for (const id of ids)
    if (!RECOMMENDED_SPDX.has(id) && !id.startsWith('LicenseRef-'))
      warnings.push(`license: ${id} may be copyleft, non-commercial or no-derivatives; check it before release`);
}

function checkTypage(dir, manifest, fileHashes, errors, warnings) {
  const typagePath = path.join(dir, 'typage.json');
  if (!existsSync(typagePath)) return void errors.push('typage.json: missing');
  const typage = readJson(typagePath);
  const shape = validateShape(typage, TYPAGE, 'typage.json');
  if (shape.length) return void errors.push(...shape);

  const files = new Map(fileHashes.map(file => [file.path, file]));
  if (!files.has(typage.entry)) errors.push(`entry ${typage.entry}: not a file of the template`);
  for (const key of Object.keys(typage.roles))
    if (!files.has(key)) errors.push(`roles.${key}: not a file of the template`);

  // System templates compile with the built-in Tectonic only (owner 10-30).
  const { engine } = typage;
  if (engine.policy !== 'tectonic-only' || engine.compiler !== 'tectonic' || engine.bundle !== 'v33')
    errors.push('engine: system templates must be tectonic-only / tectonic / v33');
  if ((typage.bibliography.system === 'biblatex') !== (engine.biber === '2.17'))
    errors.push('engine.biber: "2.17" exactly when bibliography.system is biblatex');

  const official = new Set();
  for (const file of typage.officialFiles) {
    official.add(file.path);
    const own = files.get(file.path);
    if (file.inBundle && own)
      errors.push(`officialFiles ${file.path}: inBundle but also shipped`);
    if (!file.inBundle) {
      if (!own) errors.push(`officialFiles ${file.path}: not shipped and not inBundle`);
      else if (own.sha256 !== file.sha256)
        errors.push(`officialFiles ${file.path}: differs from the recorded official hash (official files are never edited)`);
    }
  }

  if (!typage.variants.length) errors.push('variants: at least one');
  const variantIds = new Set(typage.variants.map(variant => variant.id));
  if (variantIds.size !== typage.variants.length) errors.push('variants: duplicate id');

  if (files.has(typage.entry)) {
    const text = readFileSync(path.join(dir, typage.entry), 'utf8');
    const open = new RegExp(
      `^% >>> typage-template ${manifest.id}@${manifest.version.replaceAll('.', '\\.')} variant=([a-z0-9-]+)$`,
      'm'
    );
    const match = open.exec(text);
    const close = text.indexOf('\n% <<< typage-template');
    if (!match) {
      errors.push(`${typage.entry}: missing "% >>> typage-template ${manifest.id}@${manifest.version} variant=…"`);
    } else if (close < match.index) {
      errors.push(`${typage.entry}: missing "% <<< typage-template" after the opening marker`);
    } else {
      const region = text.slice(match.index, close);
      if (!classLine(typage.templateRegion.documentClass).test(region))
        errors.push(`${typage.entry}: template region has no \\documentclass{${typage.templateRegion.documentClass}}`);
      for (const name of switchedBy(typage).packages) {
        if (!typage.templateRegion.ownedPackages.includes(name))
          errors.push(`variants: switch options of ${name}, which is not in templateRegion.ownedPackages`);
        if (!packageLine(name).test(region)) errors.push(`${typage.entry}: template region has no \\usepackage{${name}}`);
      }
      const variant = typage.variants.find(item => item.id === match[1]);
      if (!variant) errors.push(`${typage.entry}: marker names unknown variant ${match[1]}`);
      // The file is written exactly as switching to its own variant writes it.
      else if (applyVariant(text, typage, variant) !== text)
        errors.push(`${typage.entry}: template region does not match variant ${variant.id} (class/package options or switch commands)`);
    }
  }

  for (const file of fileHashes) {
    if (!TEXT_FILE.test(file.path)) continue;
    const text = readFileSync(path.join(dir, file.path), 'utf8');
    for (const [pattern, label] of FORBIDDEN) {
      if (!pattern.test(text)) continue;
      // Official files are shipped unchanged; --untrusted keeps them harmless.
      if (official.has(file.path)) warnings.push(`${file.path}: contains ${label} (official file, kept unchanged)`);
      else errors.push(`${file.path}: contains ${label}`);
    }
  }

  if (!typage.verified) errors.push('verified: missing; run tools/compile.mjs --write-verified');
  else if (typage.verified.systemTex !== false) errors.push('verified.systemTex: must be false');
}

function validateTemplate(dir, categories) {
  const errors = [];
  const warnings = [];
  const manifestPath = path.join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) return { errors: ['manifest.json: missing'], warnings };
  const manifest = readJson(manifestPath);
  const shape = validateShape(manifest, MANIFEST, 'manifest.json');
  if (shape.length) return { errors: shape, warnings };

  const format = path.basename(path.dirname(dir));
  if (manifest.id !== path.basename(dir)) errors.push(`id ${manifest.id}: must equal the directory name`);
  if (manifest.docFormat !== format) errors.push(`docFormat ${manifest.docFormat}: must equal the parent directory ${format}`);
  if (!categories[manifest.docFormat]?.some(category => category.id === manifest.category))
    errors.push(`category ${manifest.category}: not in categories.json ${manifest.docFormat}`);
  checkLicense(dir, manifest, warnings);

  const { files, problems } = hashTemplateFiles(dir);
  errors.push(...problems);
  if (JSON.stringify(files) !== JSON.stringify(manifest.files))
    errors.push('files: differ from the directory; run tools/update-hashes.mjs');
  if (files.length > MAX_TEMPLATE_FILES) errors.push(`more than ${MAX_TEMPLATE_FILES} files`);
  const total = files.reduce((sum, file) => sum + file.bytes, 0);
  const cap = manifest.sizeApproval
    ? Math.min(manifest.sizeApproval.maxBytes, HARD_MAX_TEMPLATE_BYTES)
    : DEFAULT_MAX_TEMPLATE_BYTES;
  if (total > cap) errors.push(`size ${total} bytes exceeds ${cap}`);

  if (manifest.docFormat === 'typage') checkTypage(dir, manifest, files, errors, warnings);
  else errors.push(`${manifest.docFormat} templates are reserved; their schema is not defined yet`);
  return { errors, warnings };
}

run(async () => {
  const { categories, errors: categoryErrors } = loadCategories();
  let failed = categoryErrors.length > 0;
  for (const error of categoryErrors) console.error(`categories.json: ${error}`);
  const dirs = process.argv.length > 2
    ? process.argv.slice(2).map(arg => path.resolve(arg))
    : listTemplateDirs();
  const seen = new Map();
  for (const dir of dirs) {
    const { errors, warnings } = validateTemplate(dir, categories);
    const id = path.basename(dir);
    if (seen.has(id)) errors.push(`id ${id}: also used by ${seen.get(id)}`);
    seen.set(id, rel(dir));
    for (const warning of warnings) console.warn(`warn  ${rel(dir)}: ${warning}`);
    if (errors.length) {
      failed = true;
      for (const error of errors) console.error(`FAIL  ${rel(dir)}: ${error}`);
    } else {
      console.log(`ok    ${rel(dir)}`);
    }
  }
  console.log(`${dirs.length} template(s) checked`);
  if (failed) process.exitCode = 1;
});
