import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import { runSetupWizard, detectGitHubToken } from '../src/cli/setupWizard';

describe('Setup Wizard Suite', () => {
  test('generates valid setup payload with sysoce/chat-data on master and github pages url', async () => {
    const res = await runSetupWizard({
      workspaceRoot: process.cwd(),
      port: 4300,
      enableTunnel: false,
    });

    assert.strictEqual(res.owner, 'sysoce');
    assert.strictEqual(res.repo, 'chat-data');
    assert.strictEqual(res.branch, 'master');
    assert.ok(res.githubPagesUrl.includes('https://sysoce.github.io/git-chat/#setup='));
    assert.ok(res.qrTerminal.length > 0);

    const setupHash = res.githubPagesUrl.split('#setup=')[1];
    const parsed = JSON.parse(Buffer.from(setupHash, 'base64').toString('utf8'));
    assert.strictEqual(parsed.owner, 'sysoce');
    assert.strictEqual(parsed.repo, 'chat-data');
    assert.strictEqual(parsed.branch, 'master');
  });

  test('detectGitHubToken returns string or undefined cleanly', async () => {
    const token = await detectGitHubToken();
    assert.ok(token === undefined || typeof token === 'string');
  });
});
