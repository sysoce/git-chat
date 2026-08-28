import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as http from 'node:http';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { startGitChatServer } from '../src/server/server';
import { injectSetupIntoHtml, extractEmbeddedSetup } from '../src/engine/setupInjector';

describe('Download Page & Embedded Setup Suite', () => {
  let server: http.Server;
  const testPort = 4477;
  const rootDir = path.resolve(__dirname, '..');

  before(async () => {
    server = startGitChatServer({
      port: testPort,
      host: '127.0.0.1',
      workspaceRoot: rootDir,
    });
    await new Promise(r => setTimeout(r, 100));
  });

  after(async () => {
    if (server) {
      (server as any).closeAllConnections?.();
      server.unref();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('GET /download returns HTML landing page when requested with Accept: text/html without download flag', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/download`, {
      headers: { 'Accept': 'text/html,application/xhtml+xml', 'Connection': 'close' }
    });
    assert.strictEqual(res.status, 200);
    const contentType = res.headers.get('content-type') || '';
    assert.ok(contentType.includes('text/html'));
    const body = await res.text();
    assert.ok(body.includes('id="btn-download-bundle"'), 'Should render download.html landing page');
    assert.ok(body.includes('id="qr-canvas"'), 'Should include mobile QR code section');
  });

  it('GET /download?download=1 returns git-chat.html with attachment header', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/download?download=1`, {
      headers: { 'Connection': 'close' }
    });
    assert.strictEqual(res.status, 200);
    const disposition = res.headers.get('content-disposition') || '';
    assert.ok(disposition.includes('attachment; filename="git-chat.html"'));
    const body = await res.text();
    assert.ok(body.includes('<!DOCTYPE html>'));
  });

  it('GET /download?setup=<b64>&download=1 injects the provided setup payload into the downloaded bundle', async () => {
    const setupPayload = {
      owner: 'sysoce',
      repo: 'git-chat',
      branch: 'git-chat',
      password: 'test-vault-password-4477',
      workspaceSecret: 'secret-4477',
      backendUrl: 'http://192.168.1.111:4300'
    };
    const b64 = Buffer.from(JSON.stringify(setupPayload)).toString('base64');

    const res = await fetch(`http://127.0.0.1:${testPort}/download?setup=${b64}&download=1`, {
      headers: { 'Connection': 'close' }
    });
    assert.strictEqual(res.status, 200);
    const body = await res.text();
    const extracted = extractEmbeddedSetup(body);
    assert.ok(extracted, 'Must contain extracted embedded setup');
    assert.strictEqual(extracted?.password, 'test-vault-password-4477');
    assert.strictEqual(extracted?.backendUrl, 'http://192.168.1.111:4300');
  });

  it('index.html boots up and handles embedded setup script tag in initVaultSession', () => {
    const indexPath = path.join(rootDir, 'index.html');
    const indexHtml = fs.readFileSync(indexPath, 'utf8');

    // Verify index.html handles embedded-setup-config
    assert.ok(
      indexHtml.includes('embedded-setup-config') || indexHtml.includes('__EMBEDDED_SETUP__'),
      'index.html must check for embedded-setup-config'
    );
  });
});
