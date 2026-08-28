import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DataIsolationGuard } from '../security/dataIsolationGuard';
import type { GitRemoteInfo } from '../types/protocol';

const execFileAsync = promisify(execFile);

export function parseGitRemote(remoteUrl: string): GitRemoteInfo | undefined {
  if (!remoteUrl || typeof remoteUrl !== 'string') return undefined;
  const trimmed = remoteUrl.trim();
  const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
  if (sshMatch) return { owner: sshMatch[1]!, repo: sshMatch[2]! };
  const httpsMatch = trimmed.match(/^https?:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (httpsMatch) return { owner: httpsMatch[1]!, repo: httpsMatch[2]! };
  return undefined;
}

export async function detectGitConfig(workspaceRoot: string): Promise<{ isGit: boolean; remoteUrl?: string; info?: GitRemoteInfo }> {
  try {
    const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], { cwd: workspaceRoot });
    const remoteUrl = stdout.trim();
    return { isGit: true, remoteUrl, info: parseGitRemote(remoteUrl) };
  } catch {
    const isGit = await fs.stat(path.join(workspaceRoot, '.git')).then(() => true).catch(() => false);
    return { isGit };
  }
}

export async function getHeadCommitSha(workspaceRoot: string, branch = 'git-chat'): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--verify', `refs/heads/${branch}`], { cwd: workspaceRoot });
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

export interface StagedChatFile {
  relativePath: string;
  content: string;
}

export interface CreateChatCommitOptions {
  workspaceRoot: string;
  activeUserId: string;
  branch?: string;
  files: StagedChatFile[];
  message: string;
  isWorkspaceInit?: boolean;
  cleanSlate?: boolean;
}

export interface GitChatCommitResult {
  commitSha: string;
  treeSha: string;
  filesCommitted: number;
  timestamp: number;
}

/**
 * Creates an atomic commit on the dedicated git-chat data branch using an isolated GIT_INDEX_FILE,
 * enforcing strict path sandboxing and ensuring the local working directory on master is never modified.
 */
export async function createChatCommit(opts: CreateChatCommitOptions): Promise<GitChatCommitResult> {
  const { workspaceRoot, activeUserId, files, message, isWorkspaceInit, cleanSlate } = opts;
  const branch = opts.branch || 'git-chat';

  // 1. Enforce branch security
  DataIsolationGuard.validateTargetBranch(branch);

  // 2. Validate all files against sandboxing rules BEFORE staging
  for (const f of files) {
    DataIsolationGuard.validateWritePath(f.relativePath, activeUserId, { isWorkspaceInit });
  }

  // 3. Setup isolated temporary directory and temporary index file
  const tempDir = path.join(os.tmpdir(), `git-chat-staging-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  const tempIndexPath = path.join(os.tmpdir(), `git-chat-idx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  const env = { ...process.env, GIT_INDEX_FILE: tempIndexPath };

  await fs.mkdir(tempDir, { recursive: true });

  try {
    // If the branch already exists, read its existing tree into the isolated temporary index (unless clean slate)
    const parentSha = await getHeadCommitSha(workspaceRoot, branch);
    if (parentSha && !cleanSlate) {
      await execFileAsync('git', ['read-tree', `refs/heads/${branch}`], { cwd: workspaceRoot, env });
    }

    // Write staging files and add them via git hash-object / update-index
    for (const f of files) {
      const fullStagedPath = path.join(tempDir, f.relativePath);
      await fs.mkdir(path.dirname(fullStagedPath), { recursive: true });
      await fs.writeFile(fullStagedPath, f.content, 'utf8');

      // Hash blob into Git object database
      const { stdout: blobShaOut } = await execFileAsync('git', ['hash-object', '-w', fullStagedPath], { cwd: workspaceRoot, env });
      const blobSha = blobShaOut.trim();

      // Add blob to isolated index
      await execFileAsync('git', ['update-index', '--add', '--cacheinfo', '100644', blobSha, f.relativePath], { cwd: workspaceRoot, env });
    }

    // Write tree from isolated index
    const { stdout: treeOut } = await execFileAsync('git', ['write-tree'], { cwd: workspaceRoot, env });
    const treeSha = treeOut.trim();

    // Commit tree
    const commitArgs = ['commit-tree', treeSha];
    if (parentSha) {
      commitArgs.push('-p', parentSha);
    }
    commitArgs.push('-m', message);

    const { stdout: commitOut } = await execFileAsync('git', commitArgs, { cwd: workspaceRoot, env });
    const commitSha = commitOut.trim();

    // Update ref refs/heads/git-chat atomically
    await execFileAsync('git', ['update-ref', `refs/heads/${branch}`, commitSha], { cwd: workspaceRoot });

    return {
      commitSha,
      treeSha,
      filesCommitted: files.length,
      timestamp: Date.now(),
    };
  } finally {
    // Cleanup temporary resources
    await Promise.all([
      fs.rm(tempDir, { recursive: true, force: true }).catch(() => {}),
      fs.rm(tempIndexPath, { force: true }).catch(() => {}),
    ]);
  }
}

/**
 * Pushes the isolated chat branch to the remote without touching the active working tree.
 */
export async function pushChatBranch(workspaceRoot: string, branch = 'git-chat', remote = 'origin', force = false): Promise<boolean> {
  try {
    const pushArgs = ['push', remote, `refs/heads/${branch}:${branch}`];
    if (force) pushArgs.push('--force');
    await execFileAsync('git', pushArgs, { cwd: workspaceRoot });
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads all files from the chat data branch in the local git repository.
 */
export async function readChatBranchFiles(
  workspaceRoot: string,
  branch = 'git-chat'
): Promise<Array<{ relativePath: string; content: string }>> {
  try {
    const { stdout: treeOut } = await execFileAsync('git', ['ls-tree', '-r', `refs/heads/${branch}`], { cwd: workspaceRoot });
    const lines = treeOut.trim().split('\n').filter(Boolean);
    const results: Array<{ relativePath: string; content: string }> = [];

    for (const line of lines) {
      const match = line.match(/^\d+\s+blob\s+[a-f0-9]+\s+(.+)$/);
      if (match && match[1]) {
        const filePath = match[1];
        const { stdout: blobContent } = await execFileAsync('git', ['show', `refs/heads/${branch}:${filePath}`], { cwd: workspaceRoot });
        results.push({ relativePath: filePath, content: blobContent });
      }
    }
    return results;
  } catch {
    return [];
  }
}
