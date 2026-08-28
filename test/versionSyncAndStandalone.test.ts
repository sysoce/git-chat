import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { CLIENT_VERSION } from '../src/engine/version';
import { getDmChannelId, parseDmChannelUsers } from '../src/types/chat';

describe('Version Synchronization & Standalone HTML Integrity', () => {
  const rootDir = path.resolve(__dirname, '..');
  const pkgJsonPath = path.join(rootDir, 'package.json');
  const indexHtmlPath = path.join(rootDir, 'index.html');

  it('keeps CLIENT_VERSION in sync with package.json version', () => {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    assert.strictEqual(CLIENT_VERSION, pkg.version, 'CLIENT_VERSION must match package.json version');
  });

  it('keeps index.html CLIENT_VERSION constant in sync with package.json', () => {
    const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
    const match = indexHtml.match(/const CLIENT_VERSION\s*=\s*['"]([^'"]+)['"]/);
    assert.ok(match, 'index.html must define CLIENT_VERSION');
    assert.strictEqual(match[1], CLIENT_VERSION, 'index.html version must match CLIENT_VERSION');
  });

  it('generates and parses DM channel IDs correctly in both TypeScript and standalone HTML', () => {
    // Domain helpers
    const dmId1 = getDmChannelId('user_alice', 'user_bob');
    const dmId2 = getDmChannelId('user_bob', 'user_alice');
    assert.strictEqual(dmId1, 'chan_dm_user_alice__user_bob');
    assert.strictEqual(dmId2, 'chan_dm_user_alice__user_bob');

    const participants = parseDmChannelUsers(dmId1);
    assert.deepStrictEqual(participants, ['user_alice', 'user_bob']);

    assert.strictEqual(parseDmChannelUsers('chan_general'), null);
    assert.strictEqual(parseDmChannelUsers('invalid'), null);
  });

  it('guarantees getDmChannelId and parseDmChannelUsers are defined in standalone index.html', () => {
    const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
    assert.ok(indexHtml.includes('function getDmChannelId('), 'index.html must define getDmChannelId');
    assert.ok(indexHtml.includes('function parseDmChannelUsers('), 'index.html must define parseDmChannelUsers');
    assert.ok(indexHtml.includes('window.getDmChannelId = getDmChannelId;'), 'getDmChannelId must be exposed to window');
  });
});
