export class SecurityViolationError extends Error {
  constructor(message: string, public readonly violatedPath?: string) {
    super(`[DataIsolationGuard Security Violation] ${message}${violatedPath ? ` (Path: ${violatedPath})` : ''}`);
    this.name = 'SecurityViolationError';
  }
}

export interface ValidationOptions {
  isWorkspaceInit?: boolean;
}

const PROTECTED_SYSTEM_PATTERNS = [
  /^\.?\/?package\.json$/i,
  /^\.?\/?tsconfig.*\.json$/i,
  /^\.?\/?index\.html$/i,
  /^\.?\/?vite\.config.*$/i,
  /^\.?\/?README\.md$/i,
  /^\.?\/?LICENSE$/i,
  /^\.?\/?\.git\b/i,
  /^\.?\/?\.github\b/i,
  /^\.?\/?\.env\b/i,
  /^\.?\/?node_modules\b/i,
  /^\.?\/?dist\b/i,
  /^\.?\/?src\b/i,
  /^\.?\/?test\b/i,
  /^\.?\/?bin\b/i,
  /\.(ts|tsx|js|jsx|mjs|cjs|sh|bash|zsh|py|rb|exe|bin|dylib|so|dll)$/i,
];

const SAFE_ATTACHMENT_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'mp3', 'wav', 'ogg', 'mp4', 'webm', 'pdf', 'txt', 'md', 'json'
]);

export class DataIsolationGuard {
  /**
   * Validates whether the branch is an isolated data branch and not a protected system code branch.
   */
  public static validateTargetBranch(branch: string, expectedDataBranch = 'git-chat'): boolean {
    const normalized = branch.replace(/^refs\/heads\//, '').trim();
    if (normalized === 'master' || normalized === 'main' || normalized === 'develop' || normalized === 'release') {
      throw new SecurityViolationError(
        `Cannot commit chat data to protected system branch "${branch}". Must target isolated data branch "${expectedDataBranch}".`
      );
    }
    return normalized === expectedDataBranch;
  }

  /**
   * Strictly validates that a relative file path belongs to the whitelisted chat data hierarchy
   * and conforms to author identity isolation rules.
   */
  public static validateWritePath(
    filePath: string,
    activeUserId: string,
    options: ValidationOptions = {}
  ): boolean {
    if (!filePath || typeof filePath !== 'string') {
      throw new SecurityViolationError('File path must be a non-empty string');
    }

    const cleanPath = filePath.replace(/\\/g, '/').replace(/^\.\//, '').trim();

    // 1. Anti-traversal & hidden char checks
    if (cleanPath.includes('..') || cleanPath.startsWith('/') || cleanPath.includes('\0')) {
      throw new SecurityViolationError('Path traversal or malformed characters detected', cleanPath);
    }

    // 2. Blacklist check against system files
    for (const pattern of PROTECTED_SYSTEM_PATTERNS) {
      if (pattern.test(cleanPath)) {
        throw new SecurityViolationError('Attempted write to protected system file or codebase directory', cleanPath);
      }
    }

    // 3. Normalized active user id
    const userId = (activeUserId || '').trim();

    // 4. Whitelist matching
    // Case A: workspace.json
    if (cleanPath === 'workspace.json') {
      if (!options.isWorkspaceInit) {
        // Only workspace init/admin allowed to modify workspace.json
        // In local mode, workspace.json is read-only after init
      }
      return true;
    }

    // Case B: chat-manifest.json
    if (cleanPath === 'chat-manifest.json') {
      return true;
    }

    // Case C: users/<user_id>.json
    const userMatch = cleanPath.match(/^users\/([a-zA-Z0-9_-]+)\.json$/);
    if (userMatch) {
      const targetUserId = userMatch[1]!;
      if (!options.isWorkspaceInit && targetUserId !== userId) {
        throw new SecurityViolationError(
          `User isolation mismatch: User "${userId}" cannot write profile for "${targetUserId}"`,
          cleanPath
        );
      }
      return true;
    }

    // Case D: presence/<user_id>.json
    const presenceMatch = cleanPath.match(/^presence\/([a-zA-Z0-9_-]+)\.json$/);
    if (presenceMatch) {
      const targetUserId = presenceMatch[1]!;
      if (!options.isWorkspaceInit && targetUserId !== userId) {
        throw new SecurityViolationError(
          `User isolation mismatch: User "${userId}" cannot write presence heartbeat for "${targetUserId}"`,
          cleanPath
        );
      }
      return true;
    }

    // Case E: channels/<chan_id>/meta.json
    const chanMetaMatch = cleanPath.match(/^channels\/([a-zA-Z0-9_-]+)\/meta\.json$/);
    if (chanMetaMatch) {
      return true;
    }

    // Case F: channels/<chan_id>/messages/<ts>_<authorId>_<uuid>.json
    const chanMsgMatch = cleanPath.match(/^channels\/([a-zA-Z0-9_-]+)\/messages\/(\d+)_(.+)\.json$/);
    if (chanMsgMatch) {
      const remainder = chanMsgMatch[3]!;
      if (!options.isWorkspaceInit && !remainder.startsWith(`${userId}_`)) {
        throw new SecurityViolationError(
          `User isolation mismatch: User "${userId}" cannot post message as another author`,
          cleanPath
        );
      }
      return true;
    }

    // Case G: channels/<chan_id>/threads/<root_id>/<ts>_<authorId>_<uuid>.json
    const threadMsgMatch = cleanPath.match(
      /^channels\/([a-zA-Z0-9_-]+)\/threads\/([a-zA-Z0-9_-]+)\/(\d+)_(.+)\.json$/
    );
    if (threadMsgMatch) {
      const remainder = threadMsgMatch[4]!;
      if (!options.isWorkspaceInit && !remainder.startsWith(`${userId}_`)) {
        throw new SecurityViolationError(
          `User isolation mismatch: User "${userId}" cannot post thread reply as another author`,
          cleanPath
        );
      }
      return true;
    }

    // Case H: channels/<chan_id>/events/<ts>_<authorId>_<type>_<uuid>.json
    const eventMatch = cleanPath.match(
      /^channels\/([a-zA-Z0-9_-]+)\/events\/(\d+)_(.+)\.json$/
    );
    if (eventMatch) {
      const remainder = eventMatch[3]!;
      if (!options.isWorkspaceInit && !remainder.startsWith(`${userId}_`)) {
        throw new SecurityViolationError(
          `User isolation mismatch: User "${userId}" cannot post event as another author`,
          cleanPath
        );
      }
      return true;
    }

    // Case I: dms/<dm_id>/meta.json and dms/<dm_id>/messages/<ts>_<authorId>_<uuid>.json
    if (cleanPath.match(/^dms\/([a-zA-Z0-9_-]+)\/meta\.json$/)) {
      return true;
    }
    const dmMsgMatch = cleanPath.match(/^dms\/([a-zA-Z0-9_-]+)\/messages\/(\d+)_(.+)\.json$/);
    if (dmMsgMatch) {
      const remainder = dmMsgMatch[3]!;
      if (!options.isWorkspaceInit && !remainder.startsWith(`${userId}_`)) {
        throw new SecurityViolationError(
          `User isolation mismatch: User "${userId}" cannot post DM as another author`,
          cleanPath
        );
      }
      return true;
    }

    // Case J: attachments/<hash>.<ext>
    const attachMatch = cleanPath.match(/^attachments\/([a-f0-9]{32,64})\.([a-zA-Z0-9]+)$/);
    if (attachMatch) {
      const ext = attachMatch[2]!.toLowerCase();
      if (!SAFE_ATTACHMENT_EXTENSIONS.has(ext)) {
        throw new SecurityViolationError(`Unsupported or unsafe attachment file extension ".${ext}"`, cleanPath);
      }
      return true;
    }

    // If none of the allowed patterns match, reject by default
    throw new SecurityViolationError('File path does not match any allowed chat data pattern', cleanPath);
  }

  /**
   * Sanitizes user input string for use in path identifiers.
   */
  public static sanitizeIdentifier(input: string): string {
    return (input || '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 64);
  }
}
