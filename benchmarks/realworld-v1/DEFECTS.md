# Existing core limitation exposed by sqlew

No ContractRelay core source was changed. No prompt, heuristic, gate, scoring
rule, flagship oracle or previous result was changed. No additional paid calls
will be used to repair or replace these trials.

The historical v2 `decision` tool advertises a valid JSON Schema union for its
`value` parameter: `type: ["string", "number"]`. The selected read action does
not use that field, but the existing compiler compiles the entire native tool
schema with Ajv strict types and does not enable union types. Compilation fails:

```text
strict mode: use allowUnionTypes to allow union type keyword at "#/properties/value" (strictTypes)
```

All three independent model candidates propose the documented rename and
`action="get"` default. All three fail the unchanged V0 structural gate and
remain rejected. No unchanged-client execution is authorized after rejection;
there are zero promoted sqlew candidates and zero hidden false-compatible
promotions. This is **0/3 recovery and 3/3 fail-closed rejections**, not a
successful migration or a model-generation failure.

This exposes an existing core schema-support defect/limitation. The evaluator
documents it rather than narrowing the real schema, hand-writing an adapter,
altering Ajv settings, rerunning synthesis or patching the core after seeing
results. A future implementation fix requires a separately authorized change
and separately versioned evaluation; the present results remain immutable.

To reproduce the compiler failure locally without an API call, run the sqlew
replay command documented in the suite README and inspect its V0 gate reports.
The retained candidates and reports are in `sqlew/results/trial-001.json`
through `trial-003.json`.
