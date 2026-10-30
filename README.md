# 7d24h-templates

System templates for the 7D24H desktop app: **Typage** (LaTeX papers, theses,
slides, CVs), and later **SPage** and **MPage** document skeletons. The app
reads the signed catalog, downloads a template zip and creates documents from
it. Templates are shown only in the desktop app.

7D24H 桌面端的系统模板仓库：Typage（LaTeX 论文、学位论文、幻灯片、简历），以后加入
SPage / MPage 的文档骨架。桌面端读取签名的目录文件、下载模板 zip 并据此新建文档；模板只在
桌面端展示。

## Layout

```
typage/<id>/        a Typage template: manifest.json, typage.json, LICENSE, sample and files
spage/, mpage/      reserved (see their README)
categories.json     categories per document type, in display order
schemas/            JSON Schemas for editors (generated from tools/lib/schema.mjs)
catalog/            catalog.v1.json + .sig, written by the release workflow only
tools/              validate, compile, package, catalog, sign (Node 22, no dependencies)
LICENSES/           full texts of the licenses used in this repository
```

## Compile guarantee

Every Typage system template compiles with the Tectonic 0.17.0 and bundle v33
that the desktop app ships, offline (`--untrusted --only-cached`), with no
system TeX installed - every variant, with no missing file and no undefined
reference. CI checks this on every change. Official class and style files are
used exactly as published: either taken unmodified from the bundle (`inBundle`)
or shipped byte-identical, with their hashes recorded in `typage.json`.

## Licensing

Each template directory has its own `LICENSE` file covering its files; see
[`LICENSE`](LICENSE) for the overview. Templates written by 7D24H are CC0-1.0;
third-party official files keep their own licenses and are not modified.

## Working on templates

See [`AUTHORING.md`](AUTHORING.md). Short version:

```sh
node tools/update-hashes.mjs typage/<id>
node tools/compile.mjs --tectonic <tectonic 0.17.0> --cache <cache dir> --write-verified typage/<id>
node tools/validate.mjs
```

## Release

Merging to `main` runs `.github/workflows/release.yml`: changed templates are
packed into deterministic zips, previews are rendered, the catalog is
regenerated and signed (ed25519), and everything is attached to a
`templates-YYYY.MM.DD` GitHub release. `.github/workflows/mirror.yml` then
checks the release (`tools/verify-release.mjs`) and copies the same files to
the mirror. A released template version never changes; only its license file
may be completed later, which re-publishes the same version.

Each template is one zip (`<docFormat>-<id>@<version>.zip`), so a single
template can be downloaded on its own from the release or the mirror.
Previews (`<zip stem>.thumb.webp`, 360 px wide, and `.page-1..3.webp`) are
rendered by CI from the compiled sample and published next to the zip; they
are not part of the zip or the manifest.

The desktop app reads:

- the catalog: `https://raw.githubusercontent.com/fellowAI2025/7d24h-templates/main/catalog/catalog.v1.json` (+ `.sig`),
  or `https://www.7d24h.work/downloads/templates/catalog.v1.json` (+ `.sig`)
- zips and previews: the release, or `https://www.7d24h.work/downloads/templates/<release tag>/`
  (static files only, no web pages, no directory listing)

### Release setup (once)

Repository secrets:

| secret | what |
| --- | --- |
| `CATALOG_SIGNING_KEY` | ed25519 private key (PKCS#8 PEM) from `node tools/keygen.mjs --out <file outside the repo>`; its public key is `catalog/catalog-signing.pub.pem` and is built into the desktop app |
| `MIRROR_SSH_KEY` | a private SSH key used only for the mirror |
| `MIRROR_SSH_HOST` | `user@host` of the download server |
| `MIRROR_SSH_KNOWN_HOSTS` | the server's host key line (`<host> ssh-ed25519 AAAA...`) |

The three `MIRROR_*` secrets and the server side are set up by the 7D24H
release SOP (`make setup-template-mirror` in the main repository's
`.docker/release`). On the download server the mirror key may only write
below `~/downloads/templates` (served at `/downloads/templates/`), through
rsync's restricted wrapper: no reads, no deletes, no shell, uploaded symlinks
inert.

```sh
# ~/.ssh/authorized_keys, one line:
command="rrsync -wo -no-del -munge /root/downloads/templates",restrict ssh-ed25519 AAAA... 7d24h-templates-mirror
```

Without the `MIRROR_*` secrets a release is published on GitHub only and the
mirror job warns. To upload a release again, run the `mirror` workflow by hand
with its tag.
