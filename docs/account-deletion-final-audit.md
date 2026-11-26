# Account deletion security audit

**Recommendation: NO-GO for production permanent deletion.** The available
evidence establishes isolated test behavior, not production readiness. The
coverage constant remains false; actual Cloudinary deletion, production
cleanup workers, schedulers and permanent lifecycle completion remain disabled.

## Implementation inventory and evidence

| Area | Current behavior and evidence |
| --- | --- |
| Request and authentication | The authenticated deletion request deactivates the account, removes its refresh token and returns a pending response. Login, refresh and protected APIs reject inactive or deletion-pending accounts. A scoped short-lived status cookie reports `permanentDeletionComplete: false`. Integration tests exercise the request and access restrictions. |
| Database cleanup | The coordinator runs anonymization, interactions, group membership, video tombstones and personal records in one MongoDB transaction. It now independently requires the local harness ownership marker and rejects production mode; it is not connected to a production worker or endpoint. Isolated tests exercise rollback, retries and concurrency. |
| Anonymization and interactions | The existing User ObjectId is retained, credentials and identifying fields are removed, comments are anonymized, and user-owned likes/reactions are cleaned. Reports and audit references are retained. Isolated tests cover identity preservation and rollback. |
| Groups and conversations | Cleanup transfers ownership to an eligible active admin first, then another eligible member, or deactivates the group if none qualifies. Shared conversation history is retained. A group-ownership transfer test covers the admin case; not every edge case has endpoint-level coverage. |
| Video and media | Tombstones retain the video ObjectId and moderation references while private media records preserve identifiers. Upload intents, source references, cleanup records and coverage fences track media. Initial video publishing was tested with locally generated FFmpeg input and a mocked Cloudinary uploader, including compression failure, upload failure and transaction rollback. No real Cloudinary operation was performed. |
| Moderation and shared assets | Registry references and moderation holds block eligibility; unresolved identities and historical cases remain under review. Tests cover holds, retention, synthetic reservation/reference races and mocked worker fencing. These tests do not prove every deployed writer participates. |
| Upload intent reconciliation | A durable intent precedes upload; uncertain outcomes remain blockers. Verified unregistered uploads can be reconciled into review-only queue records. There is no automatic resolver for unknown Cloudinary outcomes. Duplicate requests can produce distinct tracked intents. |
| Cleanup worker and lifecycle | Production worker entry points remain disabled. An isolated synthetic worker and lifecycle use harness-owned databases and mock adapters; their simulated completion is not permanent deletion. Pending, failed, unresolved and retained jobs prevent production completion. |
| Expiration and migration | Moment, Notification and PendingUser controlled expiration and local-test TTL index migration exist. Existing deployed TTL indexes can still bypass controlled cleanup until separately migrated. Migration recovery requires confirming the previous owner and DDL stopped; lease expiry cannot prove that. |

## Defects fixed in this audit

1. `cleanupAccount` previously accepted any deletion-pending account without
   independently checking the harness. It now requires the isolated test
   database ownership token and refuses production mode before any cleanup.
2. Video publishing previously ignored a failed FFmpeg compression result. It
   now fails before attempting a Cloudinary upload when compression fails.

The existing registration HTTP verification versus expiration race test was
reviewed. No group-avatar replacement endpoint was found in the conversation
routes; group creation accepts a verified avatar. No replacement endpoint was
added.

## Verification results

- Full local integration suite: **53 passed, 0 failed, 0 skipped**. These tests
  use a verified local replica set and harness-owned databases. Video upload
  tests replace the Cloudinary uploader with a local mock.
- Offline tests: **15 passed, 0 failed, 0 skipped**.
- Syntax checks: **136 JavaScript files passed**. App import passed.
- Index verification: **86 declared indexes across 30 models** were created and
  checked against metadata in a fresh isolated database. This does not verify
  existing production data, conflicts, deployment permissions or indexes.
- Synthetic backfills and TTL migrations passed locally; unresolved pending
  media and an uncertain upload remained coverage blockers. Existing tests
  exercise moderation, approval invalidation and test-only reservation fences.
- The guarded local-test backfill test covered bounded pages, durable
  checkpoints, stale ownership, a shared TTL-migration lock, failed-page
  recovery, repeated work and production-mode rejection. It does not validate
  real-world backup or operator evidence.

## Configuration and data requirements

The application uses `MONGODB_URI`, `ACCESS_TOKEN_SECRET`,
`ACCESS_TOKEN_EXPIRY`, `REFRESH_TOKEN_SECRET`, `REFRESH_TOKEN_EXPIRY`,
`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`,
`EMAIL_USER`, `EMAIL_PASS`, `NODE_ENV`, `PORT` and `CORS_ORIGIN` as applicable.
`MODERATION_MIN_RETENTION_DAYS` configures moderation retention. Isolated tests
use `TEST_MONGODB_URI`; the local TTL CLI uses `TTL_MIGRATION_URI`. Video
publishing requires FFmpeg on the executable path. Secrets must be supplied by
the deployment environment, never committed to source control.

MongoDB must support transactions. Deploy and verify all model-declared
collections and indexes, especially `cloudinaryassets`,
`cloudinaryassetreferences`, `mediacleanuprecords`, `mediauploadintents`,
`pendingmediaretentions`, `assetmoderationholds`, `mediacoveragebarriers`,
`mediacoverageapprovals` and `expirationschedulerleases`. Unique identity,
reference, hold and upload-intent indexes require conflict review before
creation. The local index test checks schema declarations, not a production
index migration or production data integrity.

## Deployment, recovery and limitations

Follow [the media migration runbook](media-migration-runbook.md) for backups,
maintenance and write quiescence, TTL index inspection, index deployment,
source backfills, moderation backfills and post-migration verification.
Current migration execution is restricted to verified local test databases.
The guarded test backfill runner records bounded checkpoints, fencing tokens,
simulated evidence and recovery state; its marker does not independently prove
operator authority, backup validity or production maintenance. There is
**no guarded production migration/backfill runner** or verified
production checkpoint, database identity, backup and maintenance protocol.
Building and reviewing that tooling remains required before deployment.

Do not guess legacy public IDs. Keep unknown or uncertain uploads and deletion
outcomes blocked until an authorized reviewer establishes authoritative provider
evidence and retention requirements. Preserve shared references and holds.
Restore from a tested backup only under an authorized recovery plan. A removed
TTL index cannot restore records already deleted by MongoDB. Recovery from a
failed migration requires manual confirmation the former owner and DDL have
stopped; no application fence controls out-of-band administrative DDL.
Restrict production DDL privileges and monitor catalog changes.

## Production activation checklist

- [ ] Independently review authorization, all media reference writers,
      account cleanup retention and failure recovery, including untested edge cases.
- [ ] Restore-test backup; enforce maintenance, write quiescence, DDL controls
      and exact database identity verification.
- [ ] Build and validate production-safe, resumable migration/backfill tooling
      with explicit operator authorization and backup evidence.
- [ ] Deploy and verify indexes; migrate all three TTL index types; complete and
      audit every media and moderation backfill.
- [ ] Resolve uncertain upload intents, legacy media, shared-reference and
      moderation-retention cases without guessing identities.
- [ ] Complete independent concurrency, recovery, endpoint and operational
      testing; establish verifiable coverage and external DDL monitoring.
- [ ] Obtain a separate reviewed activation decision before changing any
      production deletion or coverage safeguard.

The checklist is intentionally incomplete. **NO-GO** until all blockers are
resolved and a separate production security and operations review approves
activation.
