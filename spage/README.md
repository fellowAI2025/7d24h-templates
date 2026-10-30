# SPage templates (reserved)

SPage system templates will be document skeletons: `manifest.json`
(`7d24h-template/v1`, `docFormat: "spage"`), an `spage.json` description and
a `skeleton.md`, plus the template's own `LICENSE`. Categories are in
`categories.json` under `spage`. The `spage.json` schema is defined when the
first SPage templates are added; until then `tools/validate.mjs` rejects
directories here.

SPage 系统模板是文档骨架，格式在加入首批模板时定义；在此之前本目录不放模板。
