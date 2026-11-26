# Media migration and backfill runbook

## Status and authorization

Production execution is **not supported or approved** by the current tools. The
TTL script and guarded backfill CLI explicitly reject production and remote databases. Coverage approval,
media deletion, workers and schedulers remain disabled. The backfill functions
have no production-target safety wrapper or resumable production CLI; do not
run them against production until those controls are implemented and reviewed.
The checkpointed runner is isolated-test preparation only. Its test marker
simulates operator, backup and maintenance evidence; it does not verify a real
backup, authorize an operator or enforce production write quiescence.

## Preflight before any future production plan

1. Take and restore-test a point-in-time database backup, including indexes and
   private registry, queue, hold, intent, retention and migration collections.
   Backups and Cloudinary inventory must follow the organization's controls.
2. Establish a maintenance window and stop every application writer, worker,
   scheduler, auto-indexer and external integration that can create or remove
   media references, moderation records or indexes. Fence and drain in-flight
   work. Restrict database DDL privileges to the coordinated migration role;
   application locks do not control administrators or out-of-band DDL.
3. Record actual index metadata, collection counts, existing TTL definitions,
   current migration state, coverage fence and unresolved/review job counts.
   Verify replica-set transactions, available disk, retention rules, Cloudinary
   environment and rollback authority. Resolve unique-index conflicts before
   deployment. Do not derive public IDs from URLs.
4. Independently audit all write paths, pending-user TTL, backfill cursors,
   index creation and moderation requirements. Confirm a reviewed production
   migration tool, access controls and change authorization exist first.

## Intended order after tooling and authorization exist

1. Provision private collections and model-declared indexes for asset registry,
   asset references, media cleanup records, upload intents, pending-media
   retention, moderation holds, coverage barrier/approval and scheduler leases.
   Preserve existing indexes until their effects are understood. In particular,
   enforce unique asset identity, unique source references, unique moderation
   case/slot holds and unique cloud-name/planned-upload-ID indexes. Compare all
   deployed keys and options with each model's `schema.indexes()`; `_id` indexes
   are MongoDB defaults. The integration harness checks those declarations on
   nine listed private models, not every project model or deployed database.
2. Run coordinated Moment, Notification and PendingUser TTL replacement only
   after controlled expiration and media preservation have been validated.
   Discover TTL indexes by metadata, create non-TTL scan indexes, verify exact
   keys/options, and invalidate coverage throughout. Existing TTL indexes can
   discard references until this migration is complete.
3. Under write quiescence, audit media source pages in dry-run mode. Process
   users, pending users, videos, Moments, messages, conversations and
   notifications; checkpoint each successful cursor and investigate failures.
   Then process report and copyright hold pages. Re-run pages to establish
   idempotency; retain stale references and ambiguous identities for review.
4. Audit queue consistency, shared references, all moderation and retention
   records, unresolved uploads and remaining legacy media. Run coverage
   diagnostics again, capturing versions, statistics, actual indexes and blockers.
   The current diagnostic remains advisory and always reports incomplete.

## Supported isolated-test commands

The normal automated test creates a random harness-owned local database, checks
the marker and replica set, seeds synthetic data and removes only test-owned
records:

```powershell
$env:NODE_ENV = 'test'
$env:TEST_MONGODB_URI = 'mongodb://127.0.0.1:27018/test_account_deletion?replicaSet=rs0'
npm run test:integration
```

The TTL CLI defaults to dry-run. Only use a separately verified, marked local
test database and substitute its exact name and URI:

```powershell
$env:TTL_MIGRATION_URI = 'mongodb://127.0.0.1:27018/test_NAME?replicaSet=rs0'
node scripts/prepareExpirationIndexes.js --db test_NAME
```

For a harness-created `test_codex_<24 hex digits>` database, set
`TEST_MONGODB_URI` to its exact local URI and `TEST_RUN_OWNER_TOKEN` to its
private `_test_run_owner` token. This reads one bounded page; pass
`--cursor <cursor>` to inspect another:

```powershell
node scripts/runGuardedMediaBackfill.js --source messages --run-id test_run --limit 10
```

Synthetic execution additionally requires a matching test-only
`_backfill_preflight` marker containing the database name, owner token, operator,
backup evidence and maintenance ID, with `authorized` and `maintenanceActive`
true. Set `TEST_BACKFILL_OPERATOR`, `TEST_BACKFILL_BACKUP_EVIDENCE` and
`TEST_BACKFILL_MAINTENANCE_ID` to those test values, then add `--execute`.
Save the returned token privately as `TEST_BACKFILL_TOKEN` and repeat until
status is `complete`; the server checkpoint supplies the cursor. Sources are
`users`, `pendingUsers`, `videos`, `moments`, `messages`, `conversations`,
`notifications`, `moderationReports` and `moderationCopyright`. These markers
and commands do not establish production authorization or backup quality.

## Failure and review

Stop writers and leave coverage blocked on any failure, inconsistent snapshot,
unexpected index, lease conflict, unresolved identity or incomplete page.
Never delete unresolved media or release moderation holds to make counts pass.
For local-test recovery, first actually stop the prior migration process and
ensure its DDL has finished; lease expiry alone is insufficient. Inspect current
indexes and the durable migration token, then use the script's explicit
`--recover`, `--expected-token` and `--confirm-previous-owner-stopped` options
with the existing local-test execution flags. Previous approval is not restored.
For a failed or expired test backfill, inspect the checkpoint and lock, stop the
previous owner and confirm its work has stopped. Set `TEST_BACKFILL_TOKEN` to
the checkpoint's previous token and repeat the command with `--execute`,
`--recover` and `--confirm-previous-owner-stopped`. Lease expiry alone does not prove
the prior owner stopped. Failed or interrupted runs remain locked pending
reviewed recovery. There is no equivalent approved production recovery procedure. Restore from the
verified backup only under an independently authorized incident plan; dropping an
index cannot recover records already removed by TTL.

## Activation blockers

No production approval is possible until production-safe migration and backfill
tools, independently verified full-path fencing, complete backfills, TTL index
migrations, unresolved and shared-asset review, moderation retention evidence,
external DDL controls, isolated failure/concurrency tests and a separate
activation review are complete. Keep `REFERENCE_COVERAGE_COMPLETE` false and do
not activate deletion, cleanup workers or schedulers on the strength of this
runbook or the synthetic test.
