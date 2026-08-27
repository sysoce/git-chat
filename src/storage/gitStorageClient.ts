import { encryptBinary, bufferToBase64, VaultKey } from '../security/cryptoVault';
import type { ChatAttachment, GitStorageConfig, StorageVolumeMetadata } from '../types/chat';

export interface UploadOptions {
  authorId?: string;
  encrypt?: boolean;
  key?: VaultKey;
  targetRepo?: string;
  targetBranch?: string;
}

export class GitStorageClient {
  private config: GitStorageConfig;
  private currentVolumeIndex: number = 1;

  constructor(config: GitStorageConfig) {
    this.config = Object.assign(
      {
        allowInlineFallback: true,
        branch: 'main',
        provider: 'github' as const,
      },
      config
    );
  }

  public setConfig(newConfig: Partial<GitStorageConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public getConfig(): GitStorageConfig {
    return { ...this.config };
  }

  /**
   * Generates standard volume repository name for a given user and index.
   */
  public static getVolumeRepoName(username: string, volumeIndex = 1): string {
    const cleanUser = (username || 'user').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    if (volumeIndex <= 1) {
      return `${cleanUser}/git-chat-media`;
    }
    return `${cleanUser}/git-chat-media-vol${volumeIndex}`;
  }

  /**
   * Constructs the raw CDN / content URL for a stored object.
   */
  public getRawUrl(repo: string, branch: string, filePath: string): string {
    const cleanPath = filePath.replace(/^\//, '');
    if (this.config.provider === 'gita' || this.config.provider === 'gitlab') {
      const baseUrl = this.config.baseUrl || 'https://gita.sys.kth.se';
      return `${baseUrl}/${repo}/-/raw/${branch}/${cleanPath}`;
    }
    // Default GitHub
    return `https://raw.githubusercontent.com/${repo}/${branch}/${cleanPath}`;
  }

  private get headers(): Record<string, string> {
    const h: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'git-chat-storage-client/1.0',
    };
    if (this.config.token) {
      if (this.config.provider === 'gita' || this.config.provider === 'gitlab') {
        h['PRIVATE-TOKEN'] = this.config.token;
      } else {
        h.Authorization = `Bearer ${this.config.token}`;
      }
    }
    return h;
  }

  /**
   * Ensures the user's storage repository exists on GitHub / Gita.
   * If not found and token is provided, attempts auto-creation.
   */
  public async ensureVolume(repoName?: string): Promise<{ repo: string; branch: string; isCreated: boolean }> {
    const targetRepo = repoName || this.config.repo || GitStorageClient.getVolumeRepoName(this.config.owner || 'user', this.currentVolumeIndex);
    const branch = this.config.branch || 'main';

    if (!this.config.token) {
      return { repo: targetRepo, branch, isCreated: false };
    }

    if (this.config.provider === 'gita' || this.config.provider === 'gitlab') {
      const baseUrl = this.config.baseUrl || 'https://gita.sys.kth.se';
      const encodedPath = encodeURIComponent(targetRepo);
      const checkRes = await fetch(`${baseUrl}/api/v4/projects/${encodedPath}`, { headers: this.headers });

      if (checkRes.ok) {
        return { repo: targetRepo, branch, isCreated: false };
      }

      if (checkRes.status === 404) {
        // Attempt auto-create project
        const nameParts = targetRepo.split('/');
        const projName = nameParts[1] || targetRepo;
        const createRes = await fetch(`${baseUrl}/api/v4/projects`, {
          method: 'POST',
          headers: { ...this.headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: projName,
            visibility: 'public',
            initialize_with_readme: true,
            default_branch: branch,
          }),
        });

        if (createRes.ok) {
          return { repo: targetRepo, branch, isCreated: true };
        }
      }
    } else {
      // GitHub
      const checkRes = await fetch(`https://api.github.com/repos/${targetRepo}`, { headers: this.headers });
      if (checkRes.ok) {
        return { repo: targetRepo, branch, isCreated: false };
      }

      if (checkRes.status === 404) {
        const nameParts = targetRepo.split('/');
        const repoNameOnly = nameParts[1] || targetRepo;
        const createRes = await fetch(`https://api.github.com/user/repos`, {
          method: 'POST',
          headers: { ...this.headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: repoNameOnly,
            private: false, // Default public for raw CDN access or private with PAT
            auto_init: true,
          }),
        });

        if (createRes.ok) {
          return { repo: targetRepo, branch, isCreated: true };
        }
      }
    }

    return { repo: targetRepo, branch, isCreated: false };
  }

  /**
   * Uploads binary file/media to Git Storage Volume or falls back gracefully.
   */
  public async uploadFile(
    fileData: Uint8Array | ArrayBuffer | Blob,
    filename: string,
    mimeType: string,
    options: UploadOptions = {}
  ): Promise<ChatAttachment> {
    const bytes = fileData instanceof Uint8Array
      ? fileData
      : fileData instanceof ArrayBuffer
      ? new Uint8Array(fileData)
      : new Uint8Array(await (fileData as Blob).arrayBuffer());

    const size = bytes.byteLength;
    const authorId = options.authorId || 'user';
    const ts = Date.now();
    const safeName = filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const ext = safeName.includes('.') ? safeName.split('.').pop()!.toLowerCase() : 'bin';
    const hash = Math.random().toString(36).substring(2, 10);
    const storagePath = `attachments/${ts}_${authorId}_${hash}.${ext}`;

    // Optional E2EE Encryption
    let uploadBytes = bytes;
    let isEncrypted = false;
    if (options.encrypt && options.key) {
      const enc = await encryptBinary(bytes, options.key);
      const encPayloadStr = JSON.stringify(enc);
      const encoder = new TextEncoder();
      uploadBytes = encoder.encode(encPayloadStr);
      isEncrypted = true;
    }

    const targetRepo = options.targetRepo || this.config.repo || (this.config.owner ? GitStorageClient.getVolumeRepoName(this.config.owner, this.currentVolumeIndex) : undefined);
    const targetBranch = options.targetBranch || this.config.branch || 'main';

    // Tier 1 / Tier 2: Remote Git Upload
    if (this.config.token && targetRepo) {
      try {
        const base64Content = bufferToBase64(uploadBytes);

        if (this.config.provider === 'gita' || this.config.provider === 'gitlab') {
          const baseUrl = this.config.baseUrl || 'https://gita.sys.kth.se';
          const encodedRepo = encodeURIComponent(targetRepo);
          const encodedPath = encodeURIComponent(storagePath);
          const commitRes = await fetch(`${baseUrl}/api/v4/projects/${encodedRepo}/repository/files/${encodedPath}`, {
            method: 'POST',
            headers: { ...this.headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              branch: targetBranch,
              content: base64Content,
              encoding: 'base64',
              commit_message: `Add attachment ${safeName} (${authorId})`,
            }),
          });

          if (commitRes.ok) {
            const rawUrl = this.getRawUrl(targetRepo, targetBranch, storagePath);
            return {
              name: filename,
              type: mimeType,
              size,
              url: rawUrl,
            };
          }
        } else {
          // GitHub: Create blob and commit file via Contents API
          const putRes = await fetch(`https://api.github.com/repos/${targetRepo}/contents/${storagePath}`, {
            method: 'PUT',
            headers: { ...this.headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: `Add attachment ${safeName} (${authorId})`,
              content: base64Content,
              branch: targetBranch,
            }),
          });

          if (putRes.ok) {
            const rawUrl = this.getRawUrl(targetRepo, targetBranch, storagePath);
            return {
              name: filename,
              type: mimeType,
              size,
              url: rawUrl,
            };
          }
        }
      } catch (err) {
        console.warn('[GitStorageClient] Remote upload failed, testing fallback...', err);
      }
    }

    // Tier 3: Inline Encrypted Data URI Fallback
    if (this.config.allowInlineFallback && size < 2 * 1024 * 1024) {
      const base64Data = bufferToBase64(uploadBytes);
      const dataUri = `data:${mimeType};base64,${base64Data}`;
      return {
        name: filename,
        type: mimeType,
        size,
        url: dataUri,
      };
    }

    throw new Error(
      `Failed to upload file "${filename}". No valid Git storage token configured and file exceeds inline size threshold (2MB).`
    );
  }

  /**
   * Automatically rolls over to next volume index.
   */
  public rolloverVolume(): string {
    this.currentVolumeIndex += 1;
    if (this.config.owner) {
      this.config.repo = GitStorageClient.getVolumeRepoName(this.config.owner, this.currentVolumeIndex);
    }
    return this.config.repo || `vol_${this.currentVolumeIndex}`;
  }
}
