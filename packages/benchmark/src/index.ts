export const baselineIds = ['b0', 'b1', 'b2', 'b2v', 'b3'] as const;
export type BaselineId = typeof baselineIds[number];
export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'quota_blocked';

// Case partition loaders, sandbox, scoring and resumable execution are planned.
