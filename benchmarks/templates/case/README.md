# Case authoring template

Planned case contents:

```text
case.json          id, class, provenance, held-out flag, fixture entry point
synthesis/         old/new contracts, docs, examples visible to generators
gate/              selected replay inputs, predicates and isolated state checks
sealed-eval/       unseen inputs, labels, workflow variants and extra assertions
```

Never pass the case root to synthesis or verification. Future typed loaders must
restrict each consumer to its evidence partition. Record candidate/verdict before
the scoring process opens sealed evidence. This template contains no test labels.
