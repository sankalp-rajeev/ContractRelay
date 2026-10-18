# Bounded structural construction

The v3 capability iteration adds generic data operations to the version 1 AdapterPlan. Trusted TypeScript interprets the plan; the model supplies JSON data only. Existing plan serialization has no new defaults, and existing plan hashes remain unchanged.

Literal MCP/JSON property names support hyphens, spaces and Unicode within a 128-character limit. Empty names, control characters and `__proto__`, `prototype`, `constructor` are refused. Internal call identifiers retain the original identifier grammar. Dotted reference paths remain bounded to 16 segments and 2,048 characters, prohibit bracket/backslash syntax, and traverse only own object properties. A dot in a literal property name is accepted by RenameArg but cannot be addressed through dotted-path syntax.

## Singleton arrays

```json
{
  "op": "WrapArray",
  "source": "sample-id",
  "target": "sample-list",
  "evidence": ["change.md#batch-request"]
}
```

This moves an existing argument into exactly one array element, removes the old argument when the names differ, and refuses an overwrite. An optional absent source remains absent. Composed call arguments can use `{ "kind": "wrapArray", "source": { "kind": "input", "path": "sample-id" }, "evidence": [...] }`; the source may instead be a result reference to an earlier call. There is no iteration, flattening or array-element selection.

## Response reconstruction

```json
{
  "op": "ConstructResponse",
  "fields": {
    "matched": {
      "kind": "compareInteger",
      "source": { "kind": "response", "path": "count" },
      "operator": "gt",
      "value": 0
    },
    "query": { "kind": "input", "path": "sample-id" }
  },
  "evidence": ["change.md#response"]
}
```

Construction replaces the entire logical response with 1–32 explicit fields. References can read original old-input fields, current response fields, or named prior-call results. The interpreter retains an independent input snapshot before translation and clones referenced values, including when invocations overlap.

`compareInteger` supports only `eq` and `gt` against a safe integer constant. The source must be a numeric schema and a safe integer at execution; strings, fractions, missing paths and unsafe integers fail closed. It performs no coercion or general arithmetic.

A constant binding is `{ "kind": "constant", "value": ... }`. Construction constants are bounded to 4 levels of nesting, 128 nodes, 32 entries per container and 4,096 serialized UTF-16 code units. Computed object nesting, array maps, grouping, filtering, lambdas, recursion and arbitrary expressions are unsupported. Source paths and declared output types are checked before execution; existing Ajv input/output checks and the independent promotion gate remain mandatory.

## Synthesis and compatibility

`bounded-plan-v6` and its source file remain unchanged for the frozen benchmark. The additive `bounded-plan-v7` profile wraps the existing synthesizer and scheduler, adds the single-target structural grammar and decodes a bounded provider list of response fields into the canonical DSL record. It uses the existing evidence-reference and static validation path. Multi-target generation retains the original composed wire grammar; the interpreter can execute hand-supplied structural bindings in composed plans. Generation constants remain scalars.

The product CLI uses v7 for new migrations. `verify` and `serve` still require no model/API key and use the existing verifier, registry and MCP runtime. Plans remain candidates until independently verified; no operator selects permissions or bypasses promotion.

Historical v1/v2 results use their original implementation at commit `4d307b21c8a964bd7f59c28e807afe6b5956b922` for replay. The old Fabric generations must continue failing the old parser. The v3 freeze at `d1658407df25d6ac728e3936652e7c1925395b3f` is immutable, including the setup harness, native traces, gate inputs, sealed workflows and oracle source. The new evaluator is additive and documents the frozen unseen case's missing V3 evidence and oracle property-order limitation before evaluation.
