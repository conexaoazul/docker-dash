# Translations Tooling Reference

**Introduced:** v6.11.0 (core) + v6.11.1 (runtime overrides)  
**Source:** [`src/services/translations.js`](../../src/services/translations.js), [`src/routes/translations.js`](../../src/routes/translations.js)  
**UI entry point:** System → Translations tab

---

## Why It Exists

Docker Dash ships multiple UI locales. Before v6.11, adding translations required manually editing JS locale files and committing them — a workflow that didn't scale. Around v6.11 a coverage audit found roughly 25% of i18n keys missing in non-English locales, with the gap growing as new features added new strings.

The Translations tab solves this by: auto-detecting missing keys, calling Google Translate or DeepL APIs to generate drafts, storing them in the database for admin review, and applying accepted translations at runtime without requiring a file edit, commit, or redeploy.

---

## Architecture

```
Provider config (DB, AES-GCM encrypted API key)
        │
        ▼
Quota check (chars_used this month < monthly_limit)
        │
        ▼
Batch translate — up to 50 keys/call
  Google Translate v2  OR  DeepL Free API
        │
        ▼
translations table (pending → accepted / rejected → applied)
        │
        ▼
Runtime overrides endpoint (/api/translations/overrides/:lang)
        │
        ▼
Frontend i18n loader — deep-merge on top of static locale file
```

### Provider configuration

Two providers are supported: `google` (Cloud Translation API v2, simple key auth) and `deepl` (DeepL API Free, `api-free.deepl.com`). Provider API keys are AES-GCM encrypted at rest using the same crypto utility as notification channels and ACME credentials. The plaintext key is never logged or returned in API responses.

Each provider has an independent monthly character budget (`monthly_limit`, default 500,000). Usage is tracked in the `translation_usage` table keyed by `(provider, year_month)`.

### Quota enforcement

Before any translate call, the service checks:

```
chars_used_this_month + chars_in_this_batch > monthly_limit  →  QUOTA_EXCEEDED (HTTP 429)
```

The hard stop is enforced server-side. The UI shows current usage as a percentage progress bar. Quota resets automatically at month rollover — no manual action needed.

### Batch translate

Keys are sent in chunks of up to 50 per API call (the safe limit for both providers). The Google v2 adapter uses a `POST` with `q[]` array params; the DeepL adapter uses `URLSearchParams` with repeated `text` fields. Both have a 10-second HTTP timeout.

### Review workflow

Translated texts land in the `translations` table with `status = 'pending'`. An admin reviews each row in the UI and can:

- **Accept** — marks `status = 'accepted'`; the translation becomes live via runtime overrides immediately
- **Edit then accept** — inline text edit + accept in one action
- **Reject** — marks `status = 'rejected'`; excluded from future missing-key counts and overrides

### Runtime overrides (v6.11.1)

Accepted translations are not written to locale JS files immediately. Instead, the frontend i18n loader calls `GET /api/translations/overrides/:lang` after each static locale file registers, and deep-merges the returned tree on top. This means:

- **Accepting a translation in the Review panel takes effect on the next page load** — no file write, no git commit, no redeploy needed.
- The override endpoint requires authentication (any role) since it returns UI strings for the requesting user's locale.

### Locale file export

When you want to bake accepted translations into the static JS file permanently (e.g. before a release), use the Export button. The service reads the existing locale file, merges all `accepted`/`applied` translations, and returns a downloadable `.js` file. After committing the file, run "Mark as Exported" to flip those rows to `status = 'applied'`.

---

## Admin Workflow

1. **Add a provider** — System → Translations → Providers panel → Add Provider. Paste your Google or DeepL API key and click Test to verify connectivity.
2. **Select a language** — Languages panel shows all locale files with key coverage %. Click a language to see its missing keys.
3. **Queue a batch** — select up to 50 missing keys, choose provider, click Translate. Results appear in the Review panel with `pending` status.
4. **Review** — for each pending entry: read the machine translation, edit if needed, then Accept or Reject.
5. **Verify live** — switch the UI to the target locale; accepted strings are active immediately via runtime overrides.
6. **Export (optional)** — when ready to commit to the locale file, use Export → save the `.js` file → commit it to the repo → click Mark as Exported in the UI.

---

## API Endpoints

All endpoints are under `/api/translations/`. Auth requirements are noted per endpoint.

### Providers

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/providers` | admin | List all configured providers (API keys omitted from response) |
| `POST` | `/providers` | admin | Create or update a provider. Body: `{ provider, apiKey, monthlyLimit?, notes? }` |
| `POST` | `/providers/:id/test` | admin | Test provider connectivity (cheap API call) |
| `PATCH` | `/providers/:id` | admin | Enable/disable provider. Body: `{ isActive: bool }` |
| `DELETE` | `/providers/:id` | admin | Remove provider and its config |

### Usage

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/usage` | admin, operator | Current month char usage per provider. Optional `?yearMonth=YYYY-MM` |

### Locales

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/languages` | admin, operator | All locale files with key count, missing count, and coverage % |
| `GET` | `/missing?language=:lang` | admin, operator | Missing keys for a locale, with source text and any cached DB entry |

### Translate

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/batch` | admin | Translate up to 50 keys. Body: `{ provider, language, keys[], autoAccept? }` |

`autoAccept: true` skips the review step — translated keys are immediately set to `accepted` and go live via runtime overrides. Use with care; machine translation quality is not reviewed.

### Review

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/` | admin, operator | List translations. Optional `?language=:lang&status=:status` |
| `PATCH` | `/:id` | admin | Update a translation. Body: `{ status?, translated_text? }` |

Valid `status` values: `pending`, `accepted`, `rejected`, `applied`.

### Runtime & Export

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/overrides/:language` | any auth | Unflattened tree of `accepted`+`applied` translations for deep-merge |
| `GET` | `/export?language=:lang` | admin | Download the locale JS file with all accepted translations merged in |
| `POST` | `/mark-exported` | admin | Flip `accepted` → `applied` for a language after committing the export |

---

## Quota Math

| Provider | Monthly limit (default) | Typical missing-key batch |
|----------|------------------------|--------------------------|
| Google Translate | 500,000 chars | ~1,500 keys × ~20 chars avg = **30,000 chars** |
| DeepL Free | 500,000 chars | same |
| **Combined** | **1,000,000 chars/month** | **~3% of budget per full locale pass** |

A full pass through all missing keys for one locale costs roughly 30k characters. With two providers you can run ~33 full passes per month before hitting any limit. In practice you will rarely come close.

---

## Limitations

- **Machine translation quality requires review.** The review step is not optional by default (`autoAccept: false`). Technical strings, UI labels with placeholders, and context-sensitive phrases frequently need correction.
- **Only free-tier providers.** Only Google Cloud Translation (has a free tier up to 500k chars) and DeepL Free are supported. Azure Translator and AWS Translate are paid-only — no free tier — so they are excluded.
- **50 keys per batch.** This matches the safe per-call limit for both providers. Translating a locale with 1,500 missing keys requires 30 sequential batch calls. The UI handles this; direct API users should loop.
- **No automatic locale file commit.** The export → commit → mark-exported workflow is intentionally manual. Automated commits to locale files are out of scope (CI workflows vary too much between installations).
- **Runtime overrides load on every page render.** The override endpoint is a fast SQLite read (indexed on `language` + `status`), but it does fire once per page load per locale. On instances with hundreds of accepted translations and high concurrency this is still expected to be negligible.
- **Source locale is English only.** `listMissingKeys` compares against `en.js`. Translating between two non-English locales is not supported.

---

## See Also

- Source: [`src/services/translations.js`](../../src/services/translations.js)
- Routes: [`src/routes/translations.js`](../../src/routes/translations.js)
- CHANGELOG: v6.11.0, v6.11.1 entries
- Related: [`docs/features/prometheus-metrics.md`](./prometheus-metrics.md), [`docs/features/platform-detection.md`](./platform-detection.md)
