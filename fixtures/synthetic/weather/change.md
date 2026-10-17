# Controlled weather migration

## Tool

`get_weather` is replaced by `fetch_forecast`.

## Location

`city` is renamed to `location`, retaining its meaning.

## Units

The old tool returns Fahrenheit. The new `units` parameter is required;
`imperial` retains Fahrenheit. Selecting `metric` would violate the old semantics.

## Response

`temperature` is now `current.temperature`; `conditions` is now `current.summary`.

This hand-authored fixture checks deterministic mechanics. It is not a frozen
benchmark case and has no sealed evaluation partition or promotion verdict.
