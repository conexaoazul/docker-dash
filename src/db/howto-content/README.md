# How-To Content (markdown source of truth)

Drop a `.md` file here and the next Docker Dash startup will UPSERT it into the `howto_guides` SQLite table. The how-to immediately appears in **How-To Guides** at runtime — no migration, no rebuild.

## File naming

| Filename pattern | Purpose |
|------------------|---------|
| `<slug>.md` | English content (canonical) |
| `<slug>.ro.md` | Romanian content (optional) |
| `_*.md` | Skipped (use `_draft-foo.md` for work-in-progress that shouldn't load) |

`<slug>` must be lowercase letters/digits/hyphens (regex: `[a-z0-9-]+`). It becomes the URL fragment (`/howto/<slug>`).

## File format

Each file starts with YAML-style front-matter, then the body:

```
---
title: How to do X
summary: One-sentence blurb shown in the list.
category: basics
difficulty: beginner
icon: fas fa-book
---

<body content — markdown or HTML — rendered by the frontend>
```

### Front-matter fields

| Field | Required | Notes |
|-------|----------|-------|
| `title` | yes | Shown in card header |
| `summary` | yes | One-line preview in the list |
| `category` | yes | One of: `basics`, `linux`, `networking`, `security`, `compose`, `troubleshooting`, `backup`, `performance`, `docker-dash`, `ai`, `nas`, `vps` |
| `difficulty` | yes | `beginner` / `intermediate` / `advanced` |
| `icon` | optional | FontAwesome class (default `fas fa-book`) |

For RO files, the same fields can be present and they override the EN ones for `title_ro` / `summary_ro` / `content_ro` columns. RO files do NOT need to repeat `category` / `difficulty` / `icon` — those are EN-only.

## Why markdown, not SQL migrations

Pre-v8.3 convention: how-to seeds lived in `src/db/migrations/04*.js` (~250KB total). That was wrong:

- **Diffs unreviewable.** A 109KB single migration file changes one paragraph and looks like a complete rewrite in PR review.
- **Schema mixed with content.** Migration files should describe schema changes; content shipping at startup is a different concern.
- **No diff between "I want to fix a typo" and "I want to add a new how-to".** Both required writing a new migration with conditional UPSERT logic.

Markdown files solve all three. Existing migrations (040, 041, 042, 048, 059) stay as historical record (they already ran on existing installs); new content goes here.

## Migrating existing content

Drop a `<slug>.md` with the SAME slug as an existing built-in. The loader will overwrite the DB row's `content` and `content_ro` on next startup. No migration required.

Slugs of existing built-ins are listed in [`src/db/migrations/038_howto_guides.js`](../migrations/038_howto_guides.js).
