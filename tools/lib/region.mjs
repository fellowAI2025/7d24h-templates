// The template region of a Typage entry file and what a variant changes in
// it: the \documentclass options, the options of venue style packages
// (\usepackage[final]{neurips_2026}) and argument-less switch commands on
// their own lines (\iclrfinalcopy). This is what switching variants in the
// app does; nothing outside the region changes.

const OPEN = /^% >>> typage-template (\S+) variant=([a-z0-9-]+)$/m;
const CLOSE = '\n% <<< typage-template';

const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const loaded = (command, name) =>
  new RegExp(`\\\\${command}\\s*(?:\\[[^\\]]*\\])?\\s*\\{${escape(name)}\\}`);
const withOptions = (command, options, name) =>
  `\\${command}${options.length ? `[${options.join(',')}]` : ''}{${name}}`;

export const classLine = name => loaded('documentclass', name);
export const packageLine = name => loaded('usepackage', name);

/** The region from its opening marker up to (not including) the closing one. */
export function findRegion(text) {
  const open = OPEN.exec(text);
  if (!open) return null;
  const end = text.indexOf(CLOSE, open.index);
  if (end < 0) return null;
  return { start: open.index, end, ref: open[1], variant: open[2], text: text.slice(open.index, end) };
}

/** Packages and commands that some variant of the template switches. */
export function switchedBy(typage) {
  const packages = new Set();
  const commands = new Set();
  for (const variant of typage.variants) {
    for (const name of Object.keys(variant.packageOptions ?? {})) packages.add(name);
    for (const command of variant.commands ?? []) commands.add(command);
  }
  return { packages, commands };
}

/** The entry text switched to `variant`. */
export function applyVariant(text, typage, variant) {
  const region = findRegion(text);
  const { packages, commands } = switchedBy(typage);
  const documentClass = typage.templateRegion.documentClass;
  let out = region.text
    .replace(/^(% >>> typage-template \S+ variant=)[a-z0-9-]+$/m, `$1${variant.id}`)
    .replace(classLine(documentClass), () => withOptions('documentclass', variant.classOptions, documentClass));
  for (const name of packages)
    out = out.replace(packageLine(name), () => withOptions('usepackage', variant.packageOptions?.[name] ?? [], name));
  const lines = out.split('\n').filter(line => !commands.has(line.trim()));
  lines.push(...(variant.commands ?? []));
  return text.slice(0, region.start) + lines.join('\n') + text.slice(region.end);
}
