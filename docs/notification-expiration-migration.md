# Notification expiration index migration plan

Do not run this plan until isolated replica-set integration tests pass and a
backup and deployment window are available. The application does not run it.

1. Inventory notification indexes, including key patterns, names, TTL and
   partial-filter options. Identify the existing TTL index by its actual
   `expiresAt` key and `expireAfterSeconds`, not by an assumed name.
2. Deploy and verify notification visibility filters and the controlled
   expiration code. Keep the scheduler disabled. Existing TTL deletion may
   still run during this interval; reconcile affected references conservatively.
3. In the approved maintenance window, remove only the identified notification
   TTL index and verify its removal. Never use a blanket index drop.
4. Create and verify the non-TTL `{ expiresAt: 1, _id: 1 }` scan index named
   `notification_expiration_scan`, checking for an existing equivalent or a
   name conflict first. Ensure application `autoIndex` policy is understood.
5. Run a dry-run on a dedicated test replica set, test rollback and concurrent
   manual deletion, and reconcile orphaned/unresolved references without asset
   deletion. Confirm operational monitoring and retry procedures.
6. Only after separate approval and successful integration tests, schedule
   controlled expiration. Repeat full scans to catch backdated expirations.

Rollback: stop the scheduler first. Reintroducing a TTL index can immediately
delete expired records without registry cleanup; only do so after explicitly
accepting that effect and preserving/reconciling references.
