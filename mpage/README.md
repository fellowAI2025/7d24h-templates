# MPage templates (reserved)

MPage system templates will be multi-chapter document skeletons:
`manifest.json` (`7d24h-template/v1`, `docFormat: "mpage"`), an `mpage.json`
description and `chapters/*.md`, plus the template's own `LICENSE`. Their
categories are the MPage business types in `categories.json` under `mpage`.
The `mpage.json` schema is defined when the first MPage templates are added;
until then `tools/validate.mjs` rejects directories here.

MPage 系统模板是多章节的文档骨架，按业务类型分类，格式在加入首批模板时定义；在此之前本目录不放模板。
