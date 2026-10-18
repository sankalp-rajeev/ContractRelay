/** Standard, uncached text generation. Output includes thinking tokens.
 * Snapshot verified 2026-10-17; estimates exclude taxes/credits and unknown usage. */
export const pricingSource = 'https://ai.google.dev/gemini-api/docs/pricing';
export function estimatedTier1Cost(model: string, at: string, inputTokens: number, outputTokens: number): number | null {
  if (model !== 'gemini-3.8-flash' || !Number.isFinite(Date.parse(at))) return null;
  const multiplier = Date.parse(at) >= Date.parse('2027-01-01T00:00:00Z') ? 2 : 1;
  return (inputTokens * 0.75 + outputTokens * 3.75) * multiplier / 1000000;
}
