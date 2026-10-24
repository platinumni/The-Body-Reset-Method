# Programme content

Each programme has a folder named after its slug. Each file is one section of the programme:

```
---
key: lbr-full-01-read-this-first   # permanent id, never change it
tab: full                          # full = Full Programme, quick = Quick Run-Through
position: 1
title: Read this first: the philosophy
status: draft                      # draft | published | archived
youtube:                           # optional YouTube link
---
Body text in the simple format: ## heading, - bullet, 1. numbered, > key point, **bold**.
```

Import into a site with:

```
node scripts/import-content.mjs staging            # adds new sections only
node scripts/import-content.mjs staging --update   # also updates existing ones (saves undo history first)
```

Edits made later in admin are kept unless you import with `--update`. The previous version is always saved in the history, so it can be restored.
