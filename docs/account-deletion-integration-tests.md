# Account deletion integration tests

Tests never use `MONGODB_URI`. They require `TEST_MONGODB_URI`, a dedicated
local `mongodb://localhost:PORT/test_NAME` replica set and a pre-existing
`_integration_safety` marker document in that named database:

```text
{ _id: "account_deletion_tests", environment: "local_test", database: "test_NAME" }
```

Provision the marker only in a dedicated test environment containing no real
data. The harness rejects production mode, remote hosts, unmarked databases,
non-replica-set servers and replica sets with remote members. It then creates a
random new `test_codex_*` database, verifies it did not exist, and writes an
ownership marker. Cleanup deletes documents only in that verified test-owned
database; it does not drop databases, collections or indexes. A crash may leave
the test-owned database and marker for manual inspection.

Run the integration suite after setting the dedicated variable:

```text
node tests/integration/accountDeletion.integration.test.js
```

Without `TEST_MONGODB_URI`, database cases skip. A configured but unsafe or
unreachable target fails instead of falling back. No test calls Cloudinary.
Existing offline suites can be run directly:

```text
node tests/assetRegistry.guards.test.js
node tests/mediaCleanupWorker.test.js
node tests/accountDeletionLifecycle.test.js
node tests/expirationMigration.test.js
```

The integration file has no remaining TODO placeholders. Skipped tests are not
evidence of safety: keep workers, schedulers and deletion disabled until these
cases and concurrent rollback tests pass on the isolated replica set.
