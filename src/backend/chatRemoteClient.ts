import { DataIsolationGuard } from '../security/dataIsolationGuard';
import type { ChatMessage, ChatEvent, ChatPresence, ChatUser, ChatWorkspaceConfig, ChatManifest } from '../types/chat';

export interface GitHubRepoTarget {
  owner: string;
  repo: string;
  branch?: string; // defaults to "git-chat"
  token?: string;
}

export interface RemoteSyncResponse {
  isModified: boolean;
  etag?: string;
  manifest?: ChatManifest;
  files: Array<{ path: string; content: string }>;
}

export class ChatRemoteClient {
  private lastEtag?: string;
  private lastCommitSha?: string;

  constructor(private readonly target: GitHubRepoTarget) {
    this.target.branch = target.branch || 'git-chat';
  }

  private get headers(): Record<string, string> {
    const h: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'git-chat-client/1.0',
    };
    if (this.target.token) {
      h.Authorization = `Bearer ${this.target.token}`;
    }
    return h;
  }

  /**
   * Fetches latest state from GitHub using ETag conditional request.
   */
  public async pullUpdates(currentEtag?: string): Promise<RemoteSyncResponse> {
    const { owner, repo, branch = 'git-chat' } = this.target;
    const etagToUse = currentEtag || this.lastEtag;

    // 1. Get branch commit ref with ETag
    const reqHeaders: Record<string, string> = { ...this.headers };
    if (etagToUse) {
      reqHeaders['If-None-Match'] = etagToUse;
    }

    const refUrl = `https://api.github.com/repos/${owner}/${repo}/commits/${branch}`;
    const res = await fetch(refUrl, { headers: reqHeaders });

    if (res.status === 304) {
      return { isModified: false, etag: etagToUse, files: [] };
    }

    if (!res.ok) {
      if (res.status === 404) {
        // Branch not found yet
        return { isModified: false, files: [] };
      }
      throw new Error(`GitHub API error (${res.status}): ${await res.text()}`);
    }

    const newEtag = res.headers.get('ETag') || undefined;
    this.lastEtag = newEtag;

    const commitData = (await res.json()) as { sha: string; commit: { tree: { sha: string } } };
    this.lastCommitSha = commitData.sha;
    const treeSha = commitData.commit.tree.sha;

    // 2. Fetch full recursive tree
    const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`;
    const treeRes = await fetch(treeUrl, { headers: this.headers });
    if (!treeRes.ok) {
      throw new Error(`Failed to fetch tree: ${await treeRes.text()}`);
    }

    const treeData = (await treeRes.json()) as { tree: Array<{ path: string; mode: string; type: string; sha: string; url: string }> };
    const files: Array<{ path: string; content: string }> = [];

    // Fetch blob contents
    for (const item of treeData.tree) {
      if (item.type === 'blob') {
        const blobRes = await fetch(item.url, { headers: this.headers });
        if (blobRes.ok) {
          const blobJson = (await blobRes.json()) as { content: string; encoding: string };
          const content = blobJson.encoding === 'base64'
            ? (typeof atob === 'function' ? atob(blobJson.content.replace(/\n/g, '')) : Buffer.from(blobJson.content, 'base64').toString('utf8'))
            : blobJson.content;
          files.push({ path: item.path, content });
        }
      }
    }

    return {
      isModified: true,
      etag: newEtag,
      files,
    };
  }

  /**
   * Pushes one or more discrete user data files to GitHub data branch.
   * Enforces client-side sandboxing before making any remote API requests.
   */
  public async pushFiles(
    files: Array<{ path: string; content: string }>,
    activeUserId: string,
    commitMessage: string
  ): Promise<{ commitSha: string }> {
    const { owner, repo, branch = 'git-chat' } = this.target;

    // 1. Enforce sandbox isolation rules
    DataIsolationGuard.validateTargetBranch(branch);
    for (const f of files) {
      DataIsolationGuard.validateWritePath(f.path, activeUserId);
    }

    if (!this.target.token) {
      throw new Error('GitHub personal access token (PAT) is required for write operations');
    }

    // 2. Get latest commit SHA on data branch
    const refUrl = `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${branch}`;
    const refRes = await fetch(refUrl, { headers: this.headers });
    let parentCommitSha: string | undefined;

    if (refRes.ok) {
      const refData = (await refRes.json()) as { object: { sha: string } };
      parentCommitSha = refData.object.sha;
    }

    // 3. Create blobs for each file
    const treeItems: Array<{ path: string; mode: string; type: string; sha: string }> = [];
    for (const f of files) {
      const blobRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/blobs`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          content: typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(f.content))) : Buffer.from(f.content).toString('base64'),
          encoding: 'base64',
        }),
      });

      if (!blobRes.ok) {
        throw new Error(`Failed to create blob for ${f.path}: ${await blobRes.text()}`);
      }

      const blobData = (await blobRes.json()) as { sha: string };
      treeItems.push({
        path: f.path,
        mode: '100644',
        type: 'blob',
        sha: blobData.sha,
      });
    }

    // 4. Create new tree
    const treePayload: any = { tree: treeItems };
    if (parentCommitSha) {
      // Get parent commit tree sha
      const commitRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits/${parentCommitSha}`, { headers: this.headers });
      if (commitRes.ok) {
        const cData = (await commitRes.json()) as { tree: { sha: string } };
        treePayload.base_tree = cData.tree.sha;
      }
    }

    const newTreeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(treePayload),
    });

    if (!newTreeRes.ok) {
      throw new Error(`Failed to create tree: ${await newTreeRes.text()}`);
    }

    const newTreeData = (await newTreeRes.json()) as { sha: string };

    // 5. Create commit
    const commitBody: any = {
      message: commitMessage,
      tree: newTreeData.sha,
    };
    if (parentCommitSha) {
      commitBody.parents = [parentCommitSha];
    }

    const newCommitRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(commitBody),
    });

    if (!newCommitRes.ok) {
      throw new Error(`Failed to create commit: ${await newCommitRes.text()}`);
    }

    const newCommitData = (await newCommitRes.json()) as { sha: string };

    // 6. Update reference
    if (parentCommitSha) {
      await fetch(refUrl, {
        method: 'PATCH',
        headers: this.headers,
        body: JSON.stringify({ sha: newCommitData.sha, force: false }),
      });
    } else {
      await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: newCommitData.sha }),
      });
    }

    this.lastCommitSha = newCommitData.sha;
    return { commitSha: newCommitData.sha };
  }
}
