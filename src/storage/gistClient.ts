import {
  createRateLimitState,
  updateRateLimitFromResponse,
  buildGistHeaders,
  parseGistError,
  isNetworkOrOfflineError,
  type GistRateLimitState,
} from '../transport/gistHttp.js';

export interface GistSyncConfig {
  token: string;
  gistId: string;
  password?: string;
  baseUrl?: string;
}

export interface GistSyncFile {
  path: string;
  content: string;
  updatedAt?: number;
}

export interface GistSyncPayload {
  version?: string;
  updatedAt?: number;
  files: GistSyncFile[];
}

export const GIST_SYNC_FILENAME = 'chat-sync.json';
export const GIST_MAX_FILES = 500;
export const GIST_MAX_PAYLOAD_BYTES = 900 * 1024;

/**
 * Merges discrete sync files into an existing Gist payload, pruning the oldest
 * message and presence entries so the vault stays a bounded rolling backup
 * rather than growing past the Gist size ceiling.
 */
export function mergeGistSyncFiles(
  existing: GistSyncFile[],
  incoming: GistSyncFile[],
  now: number = Date.now(),
): GistSyncFile[] {
  const byPath = new Map<string, GistSyncFile>();
  for (const f of existing || []) {
    if (f?.path) byPath.set(f.path, f);
  }
  for (const f of incoming || []) {
    if (f?.path) byPath.set(f.path, { path: f.path, content: f.content, updatedAt: now });
  }

  let merged = Array.from(byPath.values());
  const isPrunable = (p: string) =>
    p.includes('/messages/') || p.includes('/threads/') || p.startsWith('presence/');
  const overBudget = () =>
    merged.length > GIST_MAX_FILES || JSON.stringify(merged).length > GIST_MAX_PAYLOAD_BYTES;

  if (overBudget()) {
    const prunable = merged
      .filter((f) => isPrunable(f.path))
      .sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
    const keep = new Set(merged.map((f) => f.path));
    for (const candidate of prunable) {
      if (!overBudget()) break;
      keep.delete(candidate.path);
      merged = merged.filter((f) => keep.has(f.path));
    }
  }
  return merged;
}

export interface GistFetchResult {
  data?: GistSyncPayload;
  etag?: string;
  notModified: boolean;
}

export class GistClient {
  private readonly baseUrl: string;
  private readonly rateLimit: GistRateLimitState = createRateLimitState();
  private lastEtag?: string;

  constructor(private readonly config: GistSyncConfig) {
    this.baseUrl = (config.baseUrl || 'https://api.github.com').replace(/\/+$/, '');
  }

  getRateLimitInfo(): GistRateLimitState {
    return { ...this.rateLimit };
  }

  async fetchSyncState(currentEtag?: string): Promise<GistFetchResult> {
    const etagToUse = currentEtag || this.lastEtag;
    const url = `${this.baseUrl}/gists/${this.config.gistId}`;
    const headers = buildGistHeaders(this.config.token, etagToUse);

    let res: Response;
    try {
      res = await fetch(url, { headers });
    } catch (err) {
      if (isNetworkOrOfflineError(err)) {
        return { notModified: true, etag: etagToUse };
      }
      throw err;
    }

    updateRateLimitFromResponse(this.rateLimit, res);

    if (res.status === 304) {
      return { notModified: true, etag: etagToUse };
    }

    if (!res.ok) {
      const errText = await parseGistError(res, 'Failed to fetch Gist');
      throw new Error(`Gist API error (${res.status}): ${errText}`);
    }

    const newEtag = res.headers.get('ETag') || undefined;
    this.lastEtag = newEtag;

    const gistData = (await res.json()) as { files?: Record<string, { content?: string }> };
    const syncFile = gistData.files?.[GIST_SYNC_FILENAME];
    if (!syncFile?.content) {
      return { notModified: false, etag: newEtag, data: { files: [] } };
    }

    try {
      const parsed = JSON.parse(syncFile.content) as GistSyncPayload;
      return { notModified: false, etag: newEtag, data: parsed };
    } catch {
      return { notModified: false, etag: newEtag, data: { files: [] } };
    }
  }

  async pushSyncFile(relativePath: string, content: string): Promise<void> {
    await this.pushSyncFiles([{ path: relativePath, content }]);
  }

  /**
   * Writes a batch of discrete sync files in a single Gist revision. Batching
   * matters because every push costs a read plus a write against the same
   * hourly quota that the polling fallback depends on.
   */
  async pushSyncFiles(files: GistSyncFile[]): Promise<void> {
    if (!files?.length) return;

    const fetchRes = await this.fetchSyncState();
    const existingFiles = fetchRes.data?.files || [];

    const updatedPayload: GistSyncPayload = {
      version: '1.0.9',
      updatedAt: Date.now(),
      files: mergeGistSyncFiles(existingFiles, files),
    };

    const url = `${this.baseUrl}/gists/${this.config.gistId}`;
    const headers = buildGistHeaders(this.config.token, undefined, true);
    const body = JSON.stringify({
      files: {
        [GIST_SYNC_FILENAME]: {
          content: JSON.stringify(updatedPayload, null, 2),
        },
      },
    });

    const res = await fetch(url, { method: 'PATCH', headers, body });
    updateRateLimitFromResponse(this.rateLimit, res);

    if (!res.ok) {
      const errText = await parseGistError(res, 'Failed to update Gist');
      throw new Error(`Gist update error (${res.status}): ${errText}`);
    }

    // A successful write invalidates the cached read ETag.
    this.lastEtag = undefined;
  }
}
