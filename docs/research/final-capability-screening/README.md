# Final capability iteration: stopped at unseen-case screening

No DSL changes or synthesis trials were performed. The requested iteration requires a genuinely breaking, reproducible unseen migration to be frozen **before implementation**, and explicitly requires stopping if none is found within a reasonable setup pass. No candidate was accepted during this pass. This report records that stop; it is not a realworld-v3 evaluation and does not replace any earlier result.

## arXiv: native reproduction, excluded as non-breaking

Repository: [Ray0907/arXiv-mcp](https://github.com/Ray0907/arXiv-mcp).

- Old: [`728bde88e7ccdccf10e52bd60b4ac1a7b6f02a61`](https://github.com/Ray0907/arXiv-mcp/tree/728bde88e7ccdccf10e52bd60b4ac1a7b6f02a61), README calls this v0.3.0; pyproject still says 0.2.0. There are no repository tags.
- New: [`127571ffd833dfc85728172fe293c0b19b6035ee`](https://github.com/Ray0907/arXiv-mcp/commit/127571ffd833dfc85728172fe293c0b19b6035ee), pyproject 0.4.0, SDK v2 upgrade.
- Tested unchanged invocation: `list_categories({})` over actual MCP stdio, against both unpatched servers in read-only containers without network access or credentials.
- Both succeed with exactly the same 33 text content blocks and the same structured content: `{ "result": [33 category objects] }`. Complete responses compare equal. The new output schema introduces typed Category definitions; the hypothesized object wrapping was already present in the old response. There is no measured breaking category workflow here.

The old revision has no dependency lock. Its dependency environment was resolved with uv 0.9.5 using `--exclude-newer 2026-06-03T00:00:00Z`, yielding MCP 1.27.2; the generated lock is retained and clearly distinguished from upstream evidence. The new revision uses its committed uv.lock and MCP 2.0.0. This limits the conclusion to the reproduced environments; it does not claim every possible old dependency resolution behaves identically. No dependency downgrade was selected to manufacture a break.

Exact tools/list responses, tool results, source files, Dockerfiles, locks, archive hashes and runtime image IDs are retained under `arxiv/`.

## Kiri: source-screened, not accepted for native evaluation

Repository: [CAPHTECH/kiri](https://github.com/CAPHTECH/kiri).

- Old v0.21.2: [`5aa9c0cf78e005d331f2422c52c4aaf300826bfd`](https://github.com/CAPHTECH/kiri/tree/5aa9c0cf78e005d331f2422c52c4aaf300826bfd).
- New v0.22.0: [`7b6829335cf918b60d9d7d426ea56cfd64285c4a`](https://github.com/CAPHTECH/kiri/tree/7b6829335cf918b60d9d7d426ea56cfd64285c4a).

The exact source diff changes files_search from an array response to `{results: [...]}`. However, the old source also publishes an array-root outputSchema. ContractRelay's existing MCP SDK requires an object-root outputSchema, and snapshotTools validates the actual tools/list response with that SDK. A minimal validation diagnostic confirms that boundary rejects `outputSchema.type: "array"`.

This is a source-level eligibility assessment, **not** a native Kiri reproduction or measured ContractRelay rejection. Kiri was not built or run; no successful old workflow or native tools/list was captured. Its public change is real, but admitting it through this stack would first require bypassing or extending the MCP capture/schema boundary beyond the requested Fabric/Mapbox capabilities. The retained diff and both schema source files support that assessment. No fabricated snapshot was submitted as evidence.

## State preserved

- Original 195 records, all realworld-v1 and realworld-v2 files, core/CLI source, prompts, gates, scoring, root lock and README remain unchanged.
- Mapbox v2 remains three safe rejections; Fabric v2 remains three generation failures.
- New operators, focused operator tests, post-fix trials and unseen trials: **not performed** because the prerequisite was not satisfied.
- False-compatible count for this iteration: **not applicable**, zero evaluated trials.
- Gemini calls / input / output / thinking tokens / estimated spend: **0 / 0 / 0 / 0 / $0.00**. No model key was accessed.
- `protected-before.json` records raw and LF-normalized hashes for 452 tracked files at baseline commit `1b182ee94669d021c261a2241da7fccab64ad6da`. `evidence-files.json` binds the screening evidence separately. Historical reports and hash baselines were not edited.

## API-free reproduction

From the repository root:

```powershell
# Check stored native-response equality, evidence hashes, protected files,
# and the existing MCP schema boundary; no Docker or network required.
node docs/research/final-capability-screening/replay.mjs

# Require exact original checkout bytes as well (local audit passed).
node docs/research/final-capability-screening/replay.mjs --strict-bytes

# Repeat both actual arXiv invocations using the locally retained image IDs.
node docs/research/final-capability-screening/replay.mjs --native

# Fresh machine: clone public source, rebuild both pinned environments,
# then repeat both invocations. Requires Docker and download access; no API key.
node docs/research/final-capability-screening/replay.mjs --build
```

The replay script performs screening checks only. It does not invoke Gemini, synthesize a candidate, promote an adapter, run a sealed oracle, or rewrite historical evidence.

Portable replay requires all LF-normalized protected hashes to match and reports raw-byte parity separately, because Git checkout line endings can differ. `--strict-bytes` additionally requires the captured original bytes.

Validation: 158 core/CLI tests, 9 historical guard tests, 12 inspector tests and 8 browser checks passed. Root and inspector lint/type checking, inspector production build, protected-file audits, stored-evidence replay and the fresh arXiv rebuild/native replay passed. Detailed commands, counts and the 452-file aggregate hashes are recorded in [validation.json](validation.json).
