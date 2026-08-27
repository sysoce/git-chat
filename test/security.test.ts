import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { DataIsolationGuard, SecurityViolationError } from '../src/security/dataIsolationGuard';

describe('DataIsolationGuard Security & Path Sandboxing Suite', () => {
  const activeUserId = 'user_alice';

  it('allows valid channel message discrete file for active user', () => {
    const validPath = `channels/chan_general/messages/1724760000000_user_alice_msg-001.json`;
    const res = DataIsolationGuard.validateWritePath(validPath, activeUserId);
    assert.equal(res, true);
  });

  it('allows valid thread reply discrete file for active user', () => {
    const validPath = `channels/chan_general/threads/msg-001/1724760030000_user_alice_msg-002.json`;
    const res = DataIsolationGuard.validateWritePath(validPath, activeUserId);
    assert.equal(res, true);
  });

  it('allows valid reaction event discrete file for active user', () => {
    const validPath = `channels/chan_general/events/1724760060000_user_alice_reaction_add_001.json`;
    const res = DataIsolationGuard.validateWritePath(validPath, activeUserId);
    assert.equal(res, true);
  });

  it('allows valid profile and presence update for active user', () => {
    assert.equal(DataIsolationGuard.validateWritePath(`users/user_alice.json`, activeUserId), true);
    assert.equal(DataIsolationGuard.validateWritePath(`presence/user_alice.json`, activeUserId), true);
  });

  it('REJECTS author mismatch: user_alice cannot write message as user_bob', () => {
    const mismatchPath = `channels/chan_general/messages/1724760000000_user_bob_msg-001.json`;
    assert.throws(() => {
      DataIsolationGuard.validateWritePath(mismatchPath, activeUserId);
    }, SecurityViolationError);
  });

  it('REJECTS profile mismatch: user_alice cannot overwrite user_bob profile', () => {
    assert.throws(() => {
      DataIsolationGuard.validateWritePath(`users/user_bob.json`, activeUserId);
    }, SecurityViolationError);
  });

  it('REJECTS writes to system code files (package.json, index.html, src/)', () => {
    const systemPaths = [
      'package.json',
      'tsconfig.json',
      'index.html',
      'src/index.ts',
      'src/security/dataIsolationGuard.ts',
      '.git/config',
      '.github/workflows/ci.yml',
      '.env',
      'dist/cli.js',
    ];

    for (const p of systemPaths) {
      assert.throws(() => {
        DataIsolationGuard.validateWritePath(p, activeUserId);
      }, SecurityViolationError, `Expected ${p} to be blocked by sandbox`);
    }
  });

  it('REJECTS path traversal attempts (../ or /)', () => {
    const maliciousPaths = [
      '../package.json',
      'channels/../../etc/passwd',
      '/channels/chan_general/messages/1_user_alice_1.json',
      'channels/chan_general/messages/../../../index.html',
    ];

    for (const p of maliciousPaths) {
      assert.throws(() => {
        DataIsolationGuard.validateWritePath(p, activeUserId);
      }, SecurityViolationError, `Expected traversal ${p} to be blocked`);
    }
  });

  it('REJECTS committing chat data directly to master or main codebase branch', () => {
    assert.throws(() => {
      DataIsolationGuard.validateTargetBranch('master');
    }, SecurityViolationError);

    assert.throws(() => {
      DataIsolationGuard.validateTargetBranch('refs/heads/main');
    }, SecurityViolationError);

    assert.equal(DataIsolationGuard.validateTargetBranch('git-chat'), true);
    assert.equal(DataIsolationGuard.validateTargetBranch('refs/heads/git-chat'), true);
  });
});
