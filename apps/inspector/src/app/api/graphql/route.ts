import { z } from 'zod';
import { executeRequest } from '@/server/graphql';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const bodySchema = z.object({
  query: z.string().min(1).max(32_000),
  variables: z.record(z.string(), z.unknown()).optional(),
  operationName: z.string().optional(),
});

export async function POST(request: Request) {
  // Read-only inspection endpoint: schema has no mutation/subscription or model capability.
  const text = await request.text();
  if (text.length > 64_000)
    return Response.json({ errors: [{ message: 'Request too large.' }] }, { status: 413 });
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    return Response.json({ errors: [{ message: 'Expected a JSON request.' }] }, { status: 400 });
  }
  const body = bodySchema.safeParse(value);
  if (!body.success)
    return Response.json(
      { errors: [{ message: 'Expected query, optional variables and operationName.' }] },
      { status: 400 },
    );
  const result = await executeRequest(
    body.data.query,
    body.data.variables,
    body.data.operationName,
  );
  return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
