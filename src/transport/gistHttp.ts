export interface GistRateLimitState {
  /** Epoch ms until which requests must be withheld after a rejection. */
  rateLimitReset: number;
  isRateLimited: boolean;
  remaining: number;
  limit: number;
  /** Epoch ms when the quota window refills, tracked on every response. */
  resetAt: number;
  consecutiveFailures: number;
}

export function createRateLimitState(): GistRateLimitState {
  return {
    rateLimitReset: 0,
    isRateLimited: false,
    remaining: 5000,
    limit: 5000,
    resetAt: 0,
    consecutiveFailures: 0,
  };
}

export function updateRateLimitFromResponse(state: GistRateLimitState, res: Response): void {
  const retryAfter = res.headers.get('retry-after');
  const remaining = res.headers.get('x-ratelimit-remaining');
  const reset = res.headers.get('x-ratelimit-reset');
  const limit = res.headers.get('x-ratelimit-limit');

  if (limit) state.limit = parseInt(limit, 10) || 5000;
  if (remaining) state.remaining = parseInt(remaining, 10) || 0;
  // Track the refill deadline even on success so polling can be paced to it.
  if (reset) state.resetAt = (parseInt(reset, 10) || 0) * 1000;

  if (retryAfter) {
    const seconds = parseInt(retryAfter, 10) || 60;
    state.rateLimitReset = Date.now() + seconds * 1000;
    state.isRateLimited = true;
    state.consecutiveFailures++;
    return;
  }

  if (res.status === 403 || res.status === 429 || res.status === 409) {
    state.consecutiveFailures++;
    const backoffSeconds = Math.min(120, 30 * Math.pow(2, Math.min(state.consecutiveFailures - 1, 3)));
    if (remaining && parseInt(remaining, 10) === 0 && reset) {
      state.rateLimitReset = parseInt(reset, 10) * 1000;
    } else {
      state.rateLimitReset = Date.now() + backoffSeconds * 1000;
    }
    state.isRateLimited = true;
  } else if (remaining && parseInt(remaining, 10) === 0 && reset) {
    state.rateLimitReset = parseInt(reset, 10) * 1000;
    state.isRateLimited = true;
  } else if (res.ok && remaining && parseInt(remaining, 10) > 0) {
    state.isRateLimited = false;
    state.consecutiveFailures = 0;
  }
}

export function buildGistHeaders(token: string, etag?: string, isWrite = false): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (isWrite) {
    h['Content-Type'] = 'application/json';
  }
  if (typeof window === 'undefined') {
    h['User-Agent'] = 'GitChat-Sync';
  }
  if (etag) h['If-None-Match'] = etag;
  return h;
}

export async function parseGistError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string };
    if (body?.message) return `${res.status} (${body.message})`;
  } catch {}
  return `${res.status} ${res.statusText}`.trim() || fallback;
}

export function isNetworkOrOfflineError(err: unknown): boolean {
  if (!err) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = typeof err === 'string' ? err : (err as any)?.message || '';
  const lower = msg.toLowerCase();
  return (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('load failed') ||
    lower.includes('fetch failed') ||
    lower.includes('enotfound') ||
    lower.includes('econnrefused') ||
    lower.includes('ehostunreach') ||
    lower.includes('etimedout') ||
    lower.includes('aborterror')
  );
}
