# Message attachments

New messages store a canonical `attachments` array with at most two entries.
The existing `attachment` field mirrors its first entry for older clients;
legacy records with only `attachment` remain readable. Older clients will show
only the first attachment until updated to read `attachments`. Existing legacy
messages do not need a bulk rewrite. Before deployment, run the existing media
coverage audit/backfill against a verified isolated database and review any
inconsistent legacy records; production backfill and deletion remain disabled.
The cleanup path fails closed if the two representations disagree.

Each file is limited to 20 MiB and their combined payload to 40 MiB. Multipart
requests require `Content-Length` and are capped at 40 MiB plus 128 KiB of
multipart overhead; unknown-length and chunked multipart requests receive 411.
Clients using chunked multipart transfer must supply a content length instead.
Supported attachments are JPEG, PNG, WebP, MP4, WebM, MP3, WAV and UTF-8 text;
PDF, office documents, executables and archives are not accepted. Signature and
bounded container checks do not provide complete decoding or malware scanning.
Both attachments must match the message's existing single `type` category, so
mixed image/video/document messages are not supported.

Uploads use independent durable intents and registry references. Forwarding
creates new source references; deleting a message queues each asset for review
without deleting the Cloudinary object. Account cleanup retains shared history
and writes individual review records. `REFERENCE_COVERAGE_COMPLETE` remains
false; uncertain or legacy media still requires review.
