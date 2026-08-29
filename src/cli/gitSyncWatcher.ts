import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export interface GitSyncWatcherOptions {
  owner: string;
  repo: string;
  onNewMessageFile: (filePath: string, content: string) => void;
}

export class GitSyncWatcher {
  private lastCommit = '';
  private polling = false;
  private intervalId: any = null;

  constructor(private opts: GitSyncWatcherOptions) {}

  public start(intervalMs = 8000): void {
    this.poll();
    this.intervalId = setInterval(() => this.poll(), intervalMs);
  }

  public stop(): void {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  public async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const url = `git@github.com:${this.opts.owner}/${this.opts.repo}.git`;
      const out = execSync(`git ls-remote ${url} refs/heads/master`, { encoding: 'utf-8', timeout: 5000 }).trim();
      const currentHead = out.split('\t')[0];
      if (!currentHead || currentHead === this.lastCommit) return;

      const prevCommit = this.lastCommit;
      this.lastCommit = currentHead;
      if (!prevCommit) return; // First poll baselines the head

      // Fetch changes and inspect modified files
      execSync(`git fetch --force ${url} master`, { timeout: 7000, stdio: 'pipe' });
      const files = execSync(`git diff-tree --no-commit-id --name-only -r ${currentHead}`, {
        encoding: 'utf-8'
      }).trim().split('\n');

      for (const f of files) {
        if (!f || (!f.includes('/messages/') && !f.includes('/threads/'))) continue;
        try {
          const content = execSync(`git show ${currentHead}:${f}`, { encoding: 'utf-8' });
          this.opts.onNewMessageFile(f, content);
        } catch {}
      }
    } catch {} finally {
      this.polling = false;
    }
  }

  public static async pushMessage(owner: string, repo: string, relPath: string, jsonStr: string): Promise<boolean> {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gitchat-git-'));
    try {
      execSync(`git clone --depth 1 git@github.com:${owner}/${repo}.git ${tmp}`, { stdio: 'pipe', timeout: 10000 });
      const fullPath = path.join(tmp, relPath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, jsonStr, 'utf-8');
      execSync('git add -A && git commit -m "git-chat: 1 discrete sync updates" && git push origin master', {
        cwd: tmp,
        stdio: 'pipe',
        timeout: 10000
      });
      return true;
    } catch {
      return false;
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
}
