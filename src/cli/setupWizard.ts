import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as os from 'node:os';
import { detectGitConfig, createChatCommit } from '../backend/chatGitPlumbing';
import { generateQrMatrix } from '../qr/qrEncoder';
import { renderQrToTerminal } from '../qr/qrRenderer';
import { startTunnel } from '../server/tunnel';
import type { ChatWorkspaceConfig, ChatUser, ChatMessage } from '../types/chat';

const execFileAsync = promisify(execFile);

export interface SetupOptions {
  workspaceRoot?: string;
  port?: number;
  enableTunnel?: boolean;
  password?: string;
}

export interface SetupResult {
  remoteUrl: string;
  owner: string;
  repo: string;
  branch: string;
  setupUrl: string;
  githubPagesUrl: string;
  mobileUrl: string;
  tunnelUrl?: string;
  qrTerminal: string;
}

export async function detectGitHubToken(): Promise<string | undefined> {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim();
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN.trim();
  try {
    const { stdout } = await execFileAsync('gh', ['auth', 'token']);
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function runSetupWizard(options: SetupOptions | string = {}): Promise<SetupResult> {
  const opts: SetupOptions = typeof options === 'string' ? { workspaceRoot: options } : options;
  const workspaceRoot = opts.workspaceRoot || process.cwd();
  const port = opts.port || 4300;
  const gitConfig = await detectGitConfig(workspaceRoot);
  const token = await detectGitHubToken();
  const owner = gitConfig.info?.owner || 'sysoce';
  const repo = 'chat-data';
  const branch = 'master';
  const remoteUrl = gitConfig.remoteUrl || `git@github.com:${owner}/${repo}.git`;

  // Start public tunnel if requested
  let tunnelUrl: string | undefined;
  if (opts.enableTunnel) {
    try {
      const tun = await startTunnel(port);
      if (tun) tunnelUrl = tun.url;
    } catch {}
  }

  // Detect LAN IPv4
  const ifaces = os.networkInterfaces();
  let lanUrl = `http://localhost:${port}`;
  for (const name in ifaces) {
    for (const net of ifaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        lanUrl = `http://${net.address}:${port}`;
        break;
      }
    }
  }

  const bestBackendUrl = (tunnelUrl || lanUrl).replace(/\/+$/, '');
  const setupPayload = {
    owner,
    repo,
    branch,
    token: token || '',
    password: opts.password || 'git-chat-open',
    workspaceSecret: 'git-chat-open',
    backendUrl: bestBackendUrl,
    remoteUrl,
  };

  const encodedPayload = Buffer.from(JSON.stringify(setupPayload)).toString('base64');
  const githubPagesUrl = `https://${owner}.github.io/git-chat/#setup=${encodedPayload}`;
  const mobileUrl = `${bestBackendUrl}/#setup=${encodedPayload}`;
  const setupUrl = githubPagesUrl;

  const qrMatrix = generateQrMatrix(githubPagesUrl || mobileUrl);
  const qrTerminal = renderQrToTerminal(qrMatrix);

  return {
    remoteUrl,
    owner,
    repo,
    branch,
    setupUrl,
    githubPagesUrl,
    mobileUrl,
    tunnelUrl,
    qrTerminal,
  };
}
