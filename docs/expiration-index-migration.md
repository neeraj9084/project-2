# Moment and notification expiration migration

The migration tool is restricted to a separately provisioned **local test**
database named `test_*`. It is not a production migration tool. It requires a
pre-existing `_migration_safety` document with `_id: "ttl_index_migration"`,
`environment: "local_test"`, and `database` equal to the exact database name.
Use a dedicated test database and verify that it contains no real user data.

Set `TTL_MIGRATION_URI` to the local test URI without credentials. Dry-run:

```text
node scripts/prepareExpirationIndexes.js --db test_expiration
```

Only after isolated testing and explicit authorization, the local-test-only
execution form is:

```text
node scripts/prepareExpirationIndexes.js --db test_expiration --execute --confirm-db test_expiration --acknowledge-local-test-only
```

The tool verifies the target and marker, inventories actual index metadata,
creates non-TTL scan indexes first, then rechecks each identified TTL index
before dropping it. A database lock prevents concurrent instances of this tool;
it does not stop an administrator or another migration tool. A crash may leave
the lock behind; inspect the database and indexes manually before removing it.
Rerunning after partial completion is designed to be idempotent.

Before any separately designed production migration, verify backups, deployed
index names/options, MongoDB auto-index configuration, notification and Moment
visibility filters, and registry/backfill state. The old TTL monitors continue
to delete expired records until their indexes are removed. Reconcile any lost
source references conservatively. Test transaction rollback and concurrent
manual deletion on a test replica set. Establish distributed scheduler leases,
retries, monitoring and operational approval before enabling a scheduler.

Both schedulers remain hard-disabled. Re-creating a TTL index on rollback may
immediately delete expired records without creating cleanup records; stop all
expiration processing first and assess the resulting data-loss risk explicitly.
This task does not authorize production DDL, worker activation or asset deletion.
