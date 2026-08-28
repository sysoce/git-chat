import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as http from 'node:http';
import * as path from 'node:path';
import { startGitChatServer } from '../src/server/server';

describe('Server Update Endpoints Suite', () => {
  let server: http.Server;
  const testPort = 4499;
  const workspaceRoot = path.resolve(__dirname, '..');

  before(async () => {
    await new Promise<void>((resolve) => {
      server = startGitChatServer({
        port: testPort,
        host: '127.0.0.1',
        workspaceRoot,
      });
      server.on('listening', () => resolve());
    });
  });

  after(async () => {
    if (typeof (server as any).closeAllConnections === 'function') {
      (server as any).closeAllConnections();
    }
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });


  it('GET /api/version returns JSON with current package version and downloadUrl', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/api/version`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/json');

    const body = (await res.json()) as { version?: string; downloadUrl?: string };
    assert.ok(body.version);
    assert.equal(body.downloadUrl, '/download');
  });

  it('GET /download serves standalone HTML bundle with attachment header', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/download`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /text\/html/);
    assert.match(
      res.headers.get('content-disposition') || '',
      /attachment;\s*filename="git-chat\.html"/
    );

    const text = await res.text();
    assert.match(text, /<!DOCTYPE html>/i);
    assert.match(text, /git-chat/i);
  });

  it('GET /api/sync/pull includes appVersion field', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/api/sync/pull`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { success?: boolean; appVersion?: string };
    assert.equal(body.success, true);
    assert.ok(body.appVersion);
  });
});
