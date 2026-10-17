import { ApiError, GoogleGenAI } from '@google/genai';
import type { GenerateContentParameters, GenerateContentResponse } from '@google/genai';

export interface ModelRequest {
  model: string; prompt: string; schema: unknown; maxOutputTokens: number; temperature: number;
}
export interface ModelResponse { text: string; inputTokens: number; outputTokens: number }
export interface ModelProvider { generate(request: ModelRequest): Promise<ModelResponse> }

export class ModelRequestError extends Error {
  constructor(public readonly code: string, public readonly retryAfterMs = 0, public readonly dailyQuota = false) {
    super(code);
    this.name = 'ModelRequestError';
  }
}

export function retryAfterMilliseconds(value: string | null, now: number): number {
  if (value === null) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? 0 : Math.max(0, date - now);
}

export function normalizeModelError(error: unknown): ModelRequestError {
  if (error instanceof ModelRequestError) return error;
  if (error instanceof ApiError && error.status === 429) {
    const daily = /requestsperday|per.?day|daily/i.test(error.message);
    const retry = /"retryDelay"\s*:\s*"([\d.]+)s"/.exec(error.message);
    return new ModelRequestError('RESOURCE_EXHAUSTED', retry ? Number(retry[1]) * 1000 : 0, daily);
  }
  if (error instanceof ApiError) return new ModelRequestError(`HTTP_${error.status}`);
  if (error instanceof Error && error.cause && typeof error.cause === 'object' && 'code' in error.cause
    && typeof error.cause.code === 'string' && /^[A-Z][A-Z0-9_]{0,48}$/.test(error.cause.code)) {
    return new ModelRequestError(`NETWORK_${error.cause.code}`);
  }
  return new ModelRequestError('PROVIDER_FAILED');
}

type Generate = (request: GenerateContentParameters) => Promise<Pick<GenerateContentResponse, 'text' | 'usageMetadata'>>;

export class GeminiProvider implements ModelProvider {
  private readonly generateContent: Generate;
  constructor(apiKey: string, generate?: Generate) {
    if (!apiKey.trim()) throw new ModelRequestError('MISSING_GEMINI_API_KEY');
    // SDK 1.52's optional retry wrapper drops HTTP error bodies even at attempts=1.
    // Omitting retryOptions selects its single-fetch path, preserving ApiError details.
    const client = generate ? undefined : new GoogleGenAI({ apiKey, vertexai: false,
      httpOptions: { timeout: 60_000 } });
    this.generateContent = generate ?? ((request) => (client as GoogleGenAI).models.generateContent(request));
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    try {
      const response = await this.generateContent({ model: request.model, contents: request.prompt,
        config: { responseMimeType: 'application/json', responseJsonSchema: request.schema,
          maxOutputTokens: request.maxOutputTokens, temperature: request.temperature } });
      if (!response.text) throw new ModelRequestError('EMPTY_MODEL_RESPONSE');
      return { text: response.text, inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: (response.usageMetadata?.candidatesTokenCount ?? 0) + (response.usageMetadata?.thoughtsTokenCount ?? 0) };
    } catch (error) { throw normalizeModelError(error); }
  }
}
