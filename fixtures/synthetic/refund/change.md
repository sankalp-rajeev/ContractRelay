# Controlled refund decomposition

## Lookup

Resolve the old order_id using lookup_payment; bind its payment_id into refund_payment.

## Amount

Old amounts are dollars with exactly cent precision. New amounts are integer cents.
Multiply by 100 exactly and reject unsupported precision; never round silently.

## Reason

The old refund means a customer-request refund. The new reason must be customer_request.

## Idempotency

The old request_id identifies the workflow. Pass it as idempotency_key to both
write tools. Replays with identical arguments return existing effects; a reused
key with different arguments must be rejected. Retry only through these controls.

## Status

After a completed refund, update_order_status must set refunded. This is necessary
to preserve the independently observable order state, beyond the response shape.

## Response

Project refund.id to refund_id and refund.state to status. Map completed to
refunded. A pending payment is not an immediate refund and must fail verification.

This is a resettable synthetic SQLite fixture. It sends no real refunds.
