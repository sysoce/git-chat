import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { parseGitRemote, detectGitConfig } from '../src/backend/chatGitPlumbing';

describe('Git Plumbing Utilities Suite', () => {
  it('parses SSH and HTTPS GitHub remotes accurately', () => {
    const ssh = parseGitRemote('git@github.com:sysoce/git-chat.git');
    assert.deepEqual(ssh, { owner: 'sysoce', repo: 'git-chat' });

    const https = parseGitRemote('https://github.com/sysoce/git-chat.git');
    assert.deepEqual(https, { owner: 'sysoce', repo: 'git-chat' });
  });

  it('detects git configuration in workspace root', async () => {
    const cfg = await detectGitConfig(process.cwd());
    assert.equal(cfg.isGit, true);
    assert.ok(cfg.remoteUrl);
    assert.equal(cfg.info?.owner, 'sysoce');
    assert.equal(cfg.info?.repo, 'git-chat');
  });
});
