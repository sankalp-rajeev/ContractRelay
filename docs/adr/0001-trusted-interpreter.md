# ADR 0001: Interpret bounded plans with trusted code

Status: accepted; primitive read-only subset implemented.

Models may propose data in a versioned Zod-validated DSL, never executable
ContractRelay gateway source. Compile into an isolated plan copy interpreted by
trusted TypeScript. Bind artifacts to SHA-256 hashes and validate all call/result
boundaries using JSON Schema. Unsupported operators and effects fail closed.

The initial implementation supports a single allowlisted read-only target with
top-level object argument transformations and nested response projection. It
exports a candidate-only verification API; it does not expose a promoted runtime.

Consequences: deterministic mechanics, inspectable plans, no model in the hot
path, and narrower initial coverage. Composition must be added explicitly with
bounded control flow. Behavioral preservation remains the verifier's job.
