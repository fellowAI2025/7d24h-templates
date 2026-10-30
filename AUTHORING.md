# Writing a system template

Rules for adding or updating a template in this repository. 新增或更新模板的规则。

## 1. Directory

`typage/<id>/` with `<id>` = lowercase letters, digits and `-`, unique in the
repository, equal to `manifest.json` `id`. Files:

| File | What |
| --- | --- |
| `manifest.json` | shared metadata (`7d24h-template/v1`): names, category, tags, description, license, source, file list with hashes |
| `typage.json` | Typage description (`typage-template/v1`): entry, engine, official files, template region, variants, front matter, bibliography, verification |
| `LICENSE` | the template's own license file (see 5) |
| `main.tex` | the sample, written as a compliant submission that compiles unchanged |
| `refs.bib`, other files | bibliography, and official class / style files when they are not in the bundle |

No symbolic links, dot files, executables, absolute paths or URLs in
`\input` / `\includegraphics`. Size: 64 MB per template unless
`manifest.json` `sizeApproval` raises it (hard limit 256 MB).

## 2. Tectonic only

System templates compile with the built-in Tectonic 0.17.0 and bundle v33
(TeX Live 2022) only: `engine.policy` is `tectonic-only`. Use packages and
fonts that exist in the bundle (TeX Gyre, newtx, Fandol, Latin Modern ...).
No shell-escape (`minted`, `pythontex`, `\write18`); use `listings` for code.
Chinese templates use ctex with `fontset=fandol`, never system fonts.
Prefer BibTeX; a template that needs biblatex sets `engine.biber` to `"2.17"`.

## 3. Official files are never edited

A venue's class, style and `.bst` files are used exactly as published:

- if the bundle has the official version byte for byte, do not ship it and
  list it in `officialFiles` with `"inBundle": true`;
- otherwise ship the official file unchanged with `"inBundle": false`.

Record `sha256`, `officialUrl` and `officialVersion`. CI checks the hashes and
`tools/check-official.mjs` compares them with the official address weekly.
When the venue publishes only a zip, the address is `<zip url>#<file in the
zip>`; for a GitHub repository, use the raw address at a fixed commit. A
CTAN package is addressed inside its `install/*.tds.zip`
(`https://mirrors.ctan.org/install/macros/latex/contrib/<pkg>.tds.zip#tex/latex/<pkg>/<file>`);
a package that CTAN ships only as `.dtx` (acmart, elsarticle) is addressed
inside its TeX Live archive
(`https://mirrors.ctan.org/systems/texlive/tlnet/archive/<pkg>.tar.xz#tex/latex/<pkg>/<file>`),
which holds the generated `.cls` byte for byte as TeX Live installs it. Ship
the support files of the official kit as published too (they are official
files); leave out a file whose own notice forbids distributing it on its own
(ICLR's `natbib.sty` requires `natbib.dtx`) and let the bundle provide that
package, and say so in the template's `LICENSE`.
If the official files do not compile with Tectonic, change only the sample;
if that is not enough the venue is not a system template ("official, obtain
it yourself" in the app).

## 4. The sample

- Mark the template region at the top of the entry file:

  ```tex
  % >>> typage-template <id>@<version> variant=<variant id>
  \documentclass[...]{<class>}
  ...template-owned packages and commands, \bibliographystyle...
  % <<< typage-template
  ```

  Everything after the closing marker belongs to the user and is kept when
  the user switches templates. List the class, owned packages and owned
  commands in `typage.json` `templateRegion`.
- Variants (submission / camera-ready, anonymous, paper size, one / two
  columns) change only what the class or venue style itself offers, inside
  the region: the `\documentclass` options (`classOptions`), the options of
  an owned style package (`packageOptions`, e.g.
  `{"neurips_2026": ["main", "final"]}`), or an argument-less switch command
  on its own line at the end of the region (`commands`, e.g.
  `["\\iclrfinalcopy"]`). The entry file is written exactly in the form of
  its marker's variant. CI compiles every variant.
- Keep front matter fields together and written the standard way for the
  class, so the app recognizes title, authors, affiliations, e-mails,
  abstract and keywords.
- Use placeholder names and `example.com` addresses; no real people.

## 5. License

Every template directory has its own `LICENSE`, maintained by operators. It
lists each file with its license and copyright, and the attribution a
license asks for (CC BY, Apache, OFL). Set `manifest.json` `license.spdx` to
the licenses involved (`A AND B`) and `license.file` to `LICENSE`.

Checks are advisory: `tools/validate.mjs` warns about a missing license file
or summary, and about licenses that need a look (copyleft such as GPL or
CC BY-SA, non-commercial, no-derivatives, or no license at all). Look before
releasing such a template. The license file may be completed at any time; a
license-only change is re-published under the same version.

## 6. Versions

Calendar versions `YYYY.M.N` (for example `2026.10.1`). Any change other than
the license file needs a new version; a released version never changes. To
withdraw a template set `"withdrawn": true` in `manifest.json`.

## 7. Check locally

```sh
node tools/update-hashes.mjs typage/<id>
# biblatex templates: put biber 2.17 on PATH first
node tools/compile.mjs --tectonic <path to tectonic 0.17.0> --cache <cache dir> \
  --write-verified --pdf-out /tmp/pdf typage/<id>
node tools/validate.mjs
node tools/catalog.mjs --check
```

`compile.mjs` compiles twice like the app (the first run may fetch bundle
files into the cache, the second must work with `--only-cached`), fails on
missing files and undefined references, compiles every variant, and with
`--write-verified` records the result in `typage.json` `verified`.
Visual projection and front-matter field counts (`verified.visualRaw`,
`verified.fieldsDetected`) are filled in by the 7D24H repository's verify
command.
