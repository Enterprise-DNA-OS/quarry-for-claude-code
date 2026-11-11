---
description: Bring customers, products, vehicles and weighing history across from WinWeigh CSV exports
---

Read `docs/replace-winweigh.md`. Run `npm run quarry -- import winweigh <folder> --dry-run --json` first and show the counts per file. If headings do not match, write a mapping file and add `--map=file.json`. Only run without `--dry-run` after the operator agrees the counts. Add each site with `/add` before importing tickets.
