# Historical change

The real collab_check tool was removed and consolidated into collab_claim with required action="check". The old response includes safe, nested file_status.safe/blocked, recommendation="proceed_all" and todo status; the new response flattens safe_files/blocked_files, uses recommendation="proceed", and omits old fields. Conflicting responses also change grouped rich conflicts into flat session_name/file/intent entries, dropping session IDs, scope and started_at. Native tools/list has no outputSchema; source excerpts describe these real response changes. This case tests whole-file checks against a synthetic fixture with no todos or symbols; other old features are not claimed as reproduced.

Old: package 0.9.0, `09faa20ad831ebb570490a785003a1c020f6fbfa`
New: package 2.0.0, `5b486324b5836cef4f5d547b4f1fb616c4c9a4ed`

- https://github.com/leaf76/session-collab-mcp/blob/5b486324b5836cef4f5d547b4f1fb616c4c9a4ed/MIGRATION.md

Native source excerpts and hashes are retained in source-evidence. Both servers were executed before acceptance.
