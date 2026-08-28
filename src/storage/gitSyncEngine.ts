export interface GitSyncConfig {
  owner: string;
  repo: string;
  branch: string;
  token?: string;
  baseUrl?: string;
}

export interface SyncFileItem {
  relativePath: string;
  content: string;
}

export interface FetchResult {
  files: SyncFileItem[];
  etag?: string;
  notModified: boolean;
}

export interface RateLimitState {
  remaining: number;
  limit: number;
  resetTime: number;
}

export class GitSyncEngine {
  private readonly baseUrl: string;
  private readonly rateLimit: RateLimitState = { remaining: 5000, limit: 5000, resetTime: 0 };

  constructor(private readonly config: GitSyncConfig) {
    this.baseUrl = (config.baseUrl || 'https://api.github.com').replace(/\/+$/, '');
  }

  getRateLimit(): RateLimitState {
    return { ...this.rateLimit };
  }

  private updateRateLimit(headers: { get: (name: string) => string | null }): void {
    const rem = headers.get('x-ratelimit-remaining');
    const lim = headers.get('x-ratelimit-limit');
    const reset = headers.get('x-ratelimit-reset');
    if (rem) this.rateLimit.remaining = parseInt(rem, 10);
    if (lim) this.rateLimit.limit = parseInt(lim, 10);
    if (reset) this.rateLimit.resetTime = parseInt(reset, 10) * 1000;
  }

  private buildHeaders(etag?: string): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'git-chat-sync',
    };
    if (this.config.token) {
      headers.Authorization = `Bearer ${this.config.token}`;
    }
    if (etag) {
      headers['If-None-Match'] = etag;
    }
    return headers;
  }

  async fetchBranchTree(etag?: string): Promise<FetchResult> {
    const { owner, repo, branch } = this.config;
    const url = `${this.baseUrl}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
    const res = await fetch(url, { headers: this.buildHeaders(etag) });
    this.updateRateLimit(res.headers);

    if (res.status === 304) {
      return { files: [], etag, notModified: true };
    }
    if (!res.ok) {
      throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
    }

    const newEtag = res.headers.get('etag') || undefined;
    const data = (await res.json()) as { tree?: Array<{ path: string; type: string; url: string; size?: number }> };
    const files: SyncFileItem[] = [];

    for (const item of data.tree || []) {
      if (item.type === 'blob' && item.path.endsWith('.json')) {
        try {
          const blobRes = await fetch(item.url, { headers: this.buildHeaders() });
          if (blobRes.ok) {
            const blobData = (await blobRes.json()) as { content?: string; encoding?: string };
            let content = '';
            if (blobData.encoding === 'base64' && blobData.content) {
              content = Buffer.from(blobData.content, 'base64').toString('utf8');
            } else if (blobData.content) {
              content = blobData.content;
            }
            if (content) files.push({ relativePath: item.path, content });
          }
        } catch {}
      }
    }

    return { files, etag: newEtag, notModified: false };
  }

  async pushSingleFile(relativePath: string, content: string, message?: string): Promise<string> {
    const { owner, repo, branch } = this.config;
    if (!this.config.token) {
      throw new Error('Push requires a valid GitHub token.');
    }
    const cleanPath = relativePath.replace(/^\/+/, '');
    const url = `${this.baseUrl}/repos/${owner}/${repo}/contents/${cleanPath}`;

    // Get current SHA if file exists
    let sha: string | undefined;
    try {
      const checkRes = await fetch(`${url}?ref=${branch}`, { headers: this.buildHeaders() });
      if (checkRes.ok) {
        const checkData = (await checkRes.json()) as { sha?: string };
        sha = checkData.sha;
      }
    } catch {}

    const b64Content = Buffer.from(content, 'utf8').toString('base64');
    const body: Record<string, any> = {
      message: message || `chore(chat): sync ${cleanPath}`,
      content: b64Content,
      branch,
    };
    if (sha) body.sha = sha;

    const res = await fetch(url, {
      method: 'PUT',
      headers: { ...this.buildHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    this.updateRateLimit(res.headers);

    if (!res.ok) {
      throw new Error(`Failed to push file to GitHub: ${res.status} ${res.statusText}`);
    }
    const resData = (await res.json()) as { commit?: { sha?: string } };
    return resData.commit?.sha || '';
  }
}
