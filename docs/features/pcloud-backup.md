# pCloud Backup

> Available since v8.2.0. Optional, off by default.

Push three artifact families to a pCloud account on a schedule:

| Artifact            | Default cron      | Default keep        |
|---------------------|-------------------|---------------------|
| SQLite DB backup    | `0 3 * * *`       | 7 most recent       |
| Stack bundles (JSON)| `0 4 * * 0` (Sun) | 8 weekly snapshots  |
| Audit log dump      | `5 4 1 * *` (1st) | 24 monthly dumps    |

All three live alongside the existing local `/data/backups/` rotation and the optional S3 target — they are additive, not replacements.

## Why pCloud

- **Free tier 10 GB.** Generous enough for typical Docker Dash installs (~50 MB DB compressed, ~10s of stack bundles per week, ~3 MB gzipped audit dumps per month).
- **EU data center available.** Default region in Docker Dash is **EU (Switzerland)**. Switch to US in the UI if your compliance requires it.
- **Direct token auth.** No OAuth dance — username/password are exchanged once for a long-lived token; the password is not persisted.
- **No vendor lock-in.** The artifacts are plain `.db` / `.json` / `.jsonl.gz` files, downloadable from pCloud's web UI without Docker Dash.

## Setup

1. Open **System → Backup** in the dashboard.
2. Scroll to the **pCloud Backup** card.
3. Enter your pCloud email + password, pick the region (EU pre-selected), click **Connect & Test**.
4. Once connected, schedules and retention defaults appear and can be edited.
5. Click **Run DB now** / **Run stacks now** / **Run audit now** to verify each pipeline end-to-end.

## What gets uploaded

```
pCloud:
└── /docker-dash/
    ├── db/
    │   ├── backup-daily-2026-05-04.db    ← from /data/backups/
    │   ├── backup-daily-2026-05-03.db
    │   └── ... (last 7 retained, oldest pruned)
    ├── stacks/
    │   ├── 2026-05-04/
    │   │   ├── local--web-stack.json
    │   │   └── local--db-stack.json
    │   └── ... (last 8 weeks retained)
    └── audit/
        ├── 2026-04.jsonl.gz
        ├── 2026-03.jsonl.gz
        └── ... (last 24 months retained)
```

## Encryption

- If `BACKUP_ENCRYPTION_KEY` is set, the daily DB backup is already AES-256-GCM encrypted before pCloud sees it (the file ends in `.db.enc`). pCloud only sees opaque bytes.
- Stack bundles and audit dumps are NOT encrypted by default — they're inherently less sensitive (no plaintext secrets). The existing `bundleService.exportStack` filters env-var secrets in compose definitions before they hit the bundle.
- The pCloud auth token itself is stored AES-256-GCM encrypted in the `pcloud_config` SQLite table using the same `ENCRYPTION_KEY` as every other secret in Docker Dash.

## Quota safety

Before each upload the service refreshes the account quota from `/userinfo` and aborts if the upload would push usage above 95% (or below a 50 MB safety margin). The audit log records the abort with `backup_pcloud_failed` + `reason: 'quota'`.

The free tier shows 4 GB until you complete pCloud's onboarding tasks (verify email, install mobile app); the UI surfaces a hint when `quota_total < 5 GB`.

## Restore

There is **no one-click restore from pCloud**. Restore is deliberately friction-y:

1. Download `backup-daily-YYYY-MM-DD.db` (or `.db.enc`) from pCloud's web UI.
2. If encrypted, decrypt with `BACKUP_ENCRYPTION_KEY` (the format is `salt(16) + nonce(12) + tag(16) + ciphertext`).
3. `scp` the resulting `.db` file to the server's `/data/docker-dash.db`.
4. Restart the Docker Dash container.

For stack bundles, use the existing **System → Backup → Import** flow with the downloaded JSON.

For audit dumps, the off-site copy is a witness, not a restore target — the live DB is canonical.

## Verifying audit chain integrity

Each row in the audit dump contains `entry_hash` and `prev_hash`. Within a month, row N+1's `prev_hash` equals row N's `entry_hash`. Across months, the first row of month M+1's `prev_hash` equals the last row of month M's `entry_hash`. A small Node script:

```js
const zlib = require('zlib');
const fs = require('fs');

const rows = zlib.gunzipSync(fs.readFileSync(process.argv[2]))
  .toString('utf8').trim().split('\n').map(JSON.parse);

let last = null;
for (const r of rows) {
  if (last && r.prev_hash !== last.entry_hash) {
    console.error(`Chain broken at id=${r.id}: prev=${r.prev_hash}, expected=${last.entry_hash}`);
    process.exit(1);
  }
  last = r;
}
console.log(`Chain OK: ${rows.length} rows, last hash ${last?.entry_hash}`);
```

Run as `node verify-audit-chain.js 2026-04.jsonl.gz`.

## Audit actions

| Action                 | When fired                                                   |
|------------------------|--------------------------------------------------------------|
| `pcloud_config_update` | Connect, disconnect, schedule/keep edits                     |
| `backup_pcloud`        | DB / stacks / audit upload succeeds                          |
| `backup_pcloud_failed` | Any upload fails (quota, network, login, etc.)               |
| `pcloud_prune`         | Retention prune deletes one or more files                    |

These show up in **System → Audit Log** and can be queried via the AI audit search (v8.0.0).

## Schedule changes require restart

Cron is registered at process start from the `pcloud_config` schedules. Changing schedules in the UI persists immediately but the new cron schedule takes effect on the next Docker Dash restart. The UI shows a hint reminding of this. Manual **Run now** buttons always use the current config.

## Troubleshooting

| Symptom                            | Likely cause / fix                                                            |
|------------------------------------|-------------------------------------------------------------------------------|
| "pCloud login failed"              | Wrong username/password, or wrong region (EU account being tried via US API) |
| "pCloud quota near full"           | Free up space or upgrade pCloud plan                                          |
| Backups upload but pruning doesn't | First check audit log for `pcloud_prune`; verify `keep_*` settings in UI     |
| No stack bundles in pCloud         | Check stack list — only stacks with running containers are archived           |
| "pCloud not enabled or not connected" | Token was cleared (manual disconnect, password change). Re-connect.         |
| Schedule changes not applied       | Restart the Docker Dash container — cron is registered at boot                |
