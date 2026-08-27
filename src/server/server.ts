import * as http from 'node:http';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createChatCommit, readChatBranchFiles, pushChatBranch } from '../backend/chatGitPlumbing';
import { DataIsolationGuard } from '../security/dataIsolationGuard';

export interface ServerOptions {
  port?: number;
  host?: string;
  workspaceRoot: string;
}

export function startGitChatServer(options: ServerOptions): http.Server {
  const port = options.port || 4300;
  const host = options.host || '0.0.0.0';
  const workspaceRoot = options.workspaceRoot;

  const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Active-User');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    try {
      // API: Detect Local Git / System User Identity
      if (url.pathname === '/api/identity' && req.method === 'GET') {
        let gitUserName = '';
        let gitUserEmail = '';
        try {
          const { execFile } = await import('node:child_process');
          const { promisify } = await import('node:util');
          const execFileAsync = promisify(execFile);
          const nameRes = await execFileAsync('git', ['config', 'user.name'], { cwd: workspaceRoot }).catch(() => ({ stdout: '' }));
          const emailRes = await execFileAsync('git', ['config', 'user.email'], { cwd: workspaceRoot }).catch(() => ({ stdout: '' }));
          gitUserName = nameRes.stdout.trim();
          gitUserEmail = emailRes.stdout.trim();
        } catch {}

        const os = await import('node:os');
        const sysUser = os.userInfo().username || 'user';
        const displayName = gitUserName || sysUser;
        const userId = `user_${displayName.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          userId,
          name: displayName,
          email: gitUserEmail,
          avatar: '💻',
        }));
        return;
      }

      // API: Pull latest data from local git-chat ref
      if (url.pathname === '/api/sync/pull' && req.method === 'GET') {
        const files = await readChatBranchFiles(workspaceRoot, 'git-chat');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, files, timestamp: Date.now() }));
        return;
      }

      // API: Push discrete user files to local git-chat ref
      if (url.pathname === '/api/sync/push' && req.method === 'POST') {
        let body = '';
        for await (const chunk of req) {
          body += chunk;
        }
        const data = JSON.parse(body || '{}');
        const activeUserId = (req.headers['x-active-user'] as string) || data.activeUserId || 'user_anonymous';
        const files: Array<{ relativePath: string; content: string }> = data.files || [];
        const message: string = data.message || `chore(chat): sync discrete updates for ${activeUserId}`;

        // Validate via DataIsolationGuard
        for (const f of files) {
          DataIsolationGuard.validateWritePath(f.relativePath, activeUserId);
        }

        const commitRes = await createChatCommit({
          workspaceRoot,
          activeUserId,
          files,
          message,
        });

        if (data.pushRemote) {
          await pushChatBranch(workspaceRoot, 'git-chat', 'origin').catch(() => {});
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, commitSha: commitRes.commitSha }));
        return;
      }

      // Serve index.html
      const indexPath = path.join(workspaceRoot, 'index.html');
      let htmlContent: string;
      try {
        htmlContent = await fs.readFile(indexPath, 'utf8');
      } catch {
        htmlContent = `<!DOCTYPE html><html><head><title>git-chat</title></head><body><h1>git-chat index.html not found</h1></body></html>`;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(htmlContent);
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
    }
  });

  server.listen(port, host, () => {
    console.log(`\n💬 git-chat server running at http://localhost:${port}`);
    console.log(`📡 Local Git Sync Bridge active on branch: refs/heads/git-chat`);
  });

  return server;
}
