// Strict checks for manifest.json (7d24h-template/v1), typage.json
// (typage-template/v1) and categories.json. Unknown keys are errors, so a
// typo never silently drops a field. schemas/*.schema.json describe the same
// shapes for editors; this file is what CI enforces.

const ID = /^[a-z][a-z0-9-]{1,62}$/;
const VERSION = /^\d{4}\.(?:[1-9]|1[0-2])\.\d{1,3}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const SHA256 = /^[0-9a-f]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const URL = /^https:\/\/[^\s]+$/;
const REL_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.?(?:\/|$))[A-Za-z0-9_\-./]+$/;
const TEX_COMMAND = /^\\[A-Za-z@]+\*?$/;
const PACKAGE = /^[A-Za-z0-9_-]+$/;
const OPTION = /^[A-Za-z0-9=.,_-]+$/;

const str = (max, pattern) => ({ type: 'string', max, pattern });
const nullable = spec => ({ ...spec, nullable: true });
const optional = spec => ({ ...spec, optional: true });
const oneOf = values => ({ type: 'enum', values });
const arrayOf = (items, max) => ({ type: 'array', items, max });
const object = (fields, extra) => ({ type: 'object', fields, ...extra });
const mapOf = (key, value, max) => ({ type: 'map', key, value, max });

function check(value, spec, where, errors) {
  if (value === undefined) {
    if (!spec.optional) errors.push(`${where}: missing`);
    return;
  }
  if (value === null) {
    if (!spec.nullable) errors.push(`${where}: must not be null`);
    return;
  }
  switch (spec.type) {
    case 'string':
      if (typeof value !== 'string' || !value.length)
        return void errors.push(`${where}: must be a non-empty string`);
      if (spec.max && value.length > spec.max)
        errors.push(`${where}: longer than ${spec.max}`);
      if (spec.pattern && !spec.pattern.test(value))
        errors.push(`${where}: invalid value ${JSON.stringify(value)}`);
      return;
    case 'int':
      if (!Number.isInteger(value) || value < (spec.min ?? 0) || value > spec.max)
        errors.push(`${where}: must be an integer in [${spec.min ?? 0}, ${spec.max}]`);
      return;
    case 'number':
      if (typeof value !== 'number' || value < spec.min || value > spec.max)
        errors.push(`${where}: must be a number in [${spec.min}, ${spec.max}]`);
      return;
    case 'boolean':
      if (typeof value !== 'boolean') errors.push(`${where}: must be a boolean`);
      return;
    case 'enum':
      if (!spec.values.includes(value))
        errors.push(`${where}: must be one of ${spec.values.join(', ')}`);
      return;
    case 'array':
      if (!Array.isArray(value)) return void errors.push(`${where}: must be an array`);
      if (spec.max && value.length > spec.max)
        errors.push(`${where}: more than ${spec.max} items`);
      value.forEach((item, i) => check(item, spec.items, `${where}[${i}]`, errors));
      return;
    case 'map':
      if (typeof value !== 'object' || Array.isArray(value))
        return void errors.push(`${where}: must be an object`);
      if (spec.max && Object.keys(value).length > spec.max)
        errors.push(`${where}: more than ${spec.max} entries`);
      for (const [key, item] of Object.entries(value)) {
        check(key, spec.key, `${where} key`, errors);
        check(item, spec.value, `${where}.${key}`, errors);
      }
      return;
    case 'object':
      if (typeof value !== 'object' || Array.isArray(value))
        return void errors.push(`${where}: must be an object`);
      if (!spec.open)
        for (const key of Object.keys(value))
          if (!(key in spec.fields)) errors.push(`${where}.${key}: unknown field`);
      for (const [key, field] of Object.entries(spec.fields))
        check(value[key], field, `${where}.${key}`, errors);
      return;
    default:
      throw new Error(`bad spec ${spec.type}`);
  }
}

export const MANIFEST = object({
  schema: oneOf(['7d24h-template/v1']),
  id: str(63, ID),
  version: str(16, VERSION),
  docFormat: oneOf(['spage', 'typage', 'mpage']),
  minAppVersion: str(16, SEMVER),
  name: str(120),
  nameZh: str(120),
  category: str(40, ID),
  tags: arrayOf(str(40), 12),
  description: str(600),
  descriptionZh: str(600),
  // Each template directory has its own license file, written and improved
  // by operators at any time (owner 10-30). Checks on it are advisory
  // (validate.mjs warns), and extra fields are accepted.
  license: object(
    {
      spdx: nullable(str(200)),
      file: nullable(str(240, REL_PATH)),
    },
    { open: true }
  ),
  source: object({
    kind: oneOf(['7d24h', 'official', 'adapted']),
    url: nullable(str(400, URL)),
    version: nullable(str(80)),
    retrievedAt: nullable(str(10, DATE)),
  }),
  sizeApproval: optional(
    object({ maxBytes: { type: 'int', min: 1, max: 268435456 }, reason: str(300) })
  ),
  withdrawn: optional({ type: 'boolean' }),
  files: arrayOf(
    object({
      path: str(240, REL_PATH),
      sha256: str(64, SHA256),
      bytes: { type: 'int', max: 268435456 },
    }),
    1500
  ),
});

export const FRONT_MATTER_SERIALIZERS = [
  'generic',
  'acmart',
  'ieeetran',
  'llncs',
  'elsarticle',
  'revtex',
  'ctex-thesis',
  'beamer',
  'cv',
];
const FRONT_MATTER_FIELDS = [
  'title',
  'subtitle',
  'authors',
  'affiliations',
  'emails',
  'abstract',
  'keywords',
  'ccs',
  'date',
  'thanks',
];

export const TYPAGE = object({
  schema: oneOf(['typage-template/v1']),
  kind: oneOf(['official', 'general', 'thesis', 'style-like']),
  venue: nullable(
    object({ profileId: nullable(str(63, ID)), label: str(80), labelZh: str(80) })
  ),
  entry: str(240, REL_PATH),
  engine: object({
    policy: oneOf(['tectonic-only', 'system-tex-allowed']),
    compiler: oneOf(['tectonic', 'xelatex', 'lualatex', 'pdflatex']),
    bundle: nullable(oneOf(['v33'])),
    biber: nullable(oneOf(['2.17'])),
  }),
  officialFiles: arrayOf(
    object({
      path: str(240, REL_PATH),
      inBundle: { type: 'boolean' },
      sha256: str(64, SHA256),
      officialUrl: str(400, URL),
      officialVersion: str(80),
    }),
    200
  ),
  templateRegion: object({
    documentClass: str(60, PACKAGE),
    ownedPackages: arrayOf(str(60, PACKAGE), 60),
    ownedCommands: arrayOf(str(60, TEX_COMMAND), 60),
  }),
  variants: arrayOf(
    object({
      id: str(40, ID),
      label: str(60),
      labelZh: str(60),
      classOptions: arrayOf(str(60, OPTION), 20),
      // Venue styles switch review / final with package options
      // (\usepackage[final]{neurips_2026}) or an argument-less command on its
      // own line in the template region (\iclrfinalcopy).
      packageOptions: optional(mapOf(str(60, PACKAGE), arrayOf(str(60, OPTION), 20), 4)),
      commands: optional(arrayOf(str(60, TEX_COMMAND), 8)),
    }),
    12
  ),
  frontMatter: object({
    serializer: oneOf(FRONT_MATTER_SERIALIZERS),
    fields: arrayOf(oneOf(FRONT_MATTER_FIELDS), FRONT_MATTER_FIELDS.length),
  }),
  bibliography: object({
    system: oneOf(['bibtex', 'biblatex', 'none']),
    style: nullable(str(80, /^[A-Za-z0-9_-]+$/)),
    citation: oneOf(['numeric', 'author-year', 'none']),
    citeCommands: mapOf(str(40, TEX_COMMAND), str(40, TEX_COMMAND), 20),
  }),
  classCommands: arrayOf(
    object({ command: str(60, TEX_COMMAND), to: nullable(str(60, TEX_COMMAND)) }),
    60
  ),
  requirements: nullable(
    object({
      pageLimit: nullable({ type: 'int', min: 1, max: 1000 }),
      anonymous: { type: 'boolean' },
    })
  ),
  visualTheme: nullable(
    object({
      fontFamily: str(80),
      baseSizePt: { type: 'number', min: 6, max: 20 },
      lineSpread: { type: 'number', min: 0.8, max: 3 },
      paper: oneOf(['a4', 'letter']),
    })
  ),
  roles: mapOf(
    str(240, REL_PATH),
    oneOf(['sample', 'class', 'style', 'bst', 'bib', 'figure', 'font', 'support']),
    1500
  ),
  verified: nullable(
    object({
      compiler: str(80),
      systemTex: { type: 'boolean' },
      officialFilesMatch: nullable({ type: 'boolean' }),
      pages: { type: 'int', min: 1, max: 5000 },
      visualRaw: nullable({ type: 'int', max: 100000 }),
      fieldsDetected: nullable({ type: 'int', max: 100 }),
      at: str(40, ISO),
      by: str(80),
    })
  ),
});

export const CATEGORIES = object({
  schema: oneOf(['7d24h-template-categories/v1']),
  spage: arrayOf(object({ id: str(40, ID), label: str(60), labelZh: str(60) }), 40),
  typage: arrayOf(object({ id: str(40, ID), label: str(60), labelZh: str(60) }), 40),
  mpage: arrayOf(object({ id: str(40, ID), label: str(60), labelZh: str(60) }), 40),
});

export function validateShape(value, spec, where) {
  const errors = [];
  check(value, spec, where, errors);
  return errors;
}
