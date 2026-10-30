#!/usr/bin/env node
// Rewrites manifest.files from the files on disk. It never touches the
// recorded official hashes in typage.json: those say what the official file
// is, and validate.mjs compares the shipped bytes against them.
//
//   node tools/update-hashes.mjs <docFormat>/<id> [...]
import path from 'node:path';

import { ToolError, hashTemplateFiles, readJson, rel, run, writeJson } from './lib/common.mjs';

run(async () => {
  const dirs = process.argv.slice(2).map(arg => path.resolve(arg));
  if (!dirs.length) throw new ToolError('name the template directories to update');
  for (const dir of dirs) {
    const file = path.join(dir, 'manifest.json');
    const manifest = readJson(file);
    const { files, problems } = hashTemplateFiles(dir);
    if (problems.length) throw new ToolError(`${rel(dir)}: ${problems.join('; ')}`);
    manifest.files = files;
    writeJson(file, manifest);
    console.log(`updated ${rel(file)} (${files.length} files)`);
  }
});
