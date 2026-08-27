import { describe, it } from 'node:test';
import assert from 'node:assert';
import { WorkspaceMembership } from '../src/security/workspaceMembership';
import { DataIsolationGuard } from '../src/security/dataIsolationGuard';

describe('WorkspaceMembership & Dual-Mode Access Control Suite', () => {
  it('allows any author in Free Open Use mode (open policy)', () => {
    const config = WorkspaceMembership.createDefaultConfig(
      'ws_hackathon',
      { id: 'user_sysoce', gitUsername: 'sysoce', name: 'Sysoce' },
      'open'
    );

    assert.strictEqual(config.membershipPolicy, 'open');
    assert.strictEqual(WorkspaceMembership.isAuthorAllowed('random_stranger_123', config), true);
    assert.strictEqual(WorkspaceMembership.isAuthorAllowed('user_sysoce', config), true);

    // DataIsolationGuard permits write in open mode
    assert.doesNotThrow(() => {
      DataIsolationGuard.validateWritePath(
        'channels/general/messages/1787830000000_user_stranger_abc123.json',
        'user_stranger',
        { membersConfig: config }
      );
    });
  });

  it('restricts author writes to allowlist in Enterprise Strict mode (invite_only policy)', () => {
    const config = WorkspaceMembership.createDefaultConfig(
      'ws_enterprise',
      { id: 'user_admin', gitUsername: 'admin_user', name: 'Admin' },
      'invite_only'
    );

    assert.strictEqual(config.membershipPolicy, 'invite_only');
    assert.strictEqual(WorkspaceMembership.isAuthorAllowed('admin_user', config), true);
    assert.strictEqual(WorkspaceMembership.isAuthorAllowed('uninvited_guest', config), false);

    // DataIsolationGuard blocks uninvited author in invite_only mode
    assert.throws(
      () => {
        DataIsolationGuard.validateWritePath(
          'channels/general/messages/1787830000000_uninvited_guest_abc123.json',
          'uninvited_guest',
          { membersConfig: config }
        );
      },
      /Access Denied/
    );
  });

  it('adds and removes members from the roster cleanly', () => {
    let config = WorkspaceMembership.createDefaultConfig(
      'ws_team',
      { id: 'user_admin', gitUsername: 'admin_user', name: 'Admin' },
      'invite_only'
    );

    // Add Alice
    config = WorkspaceMembership.upsertMember(config, {
      id: 'user_alice',
      gitUsername: 'alice_kth',
      name: 'Alice',
      role: 'member',
    });

    assert.strictEqual(config.members.length, 2);
    assert.strictEqual(WorkspaceMembership.isAuthorAllowed('user_alice', config), true);
    assert.strictEqual(WorkspaceMembership.isUserAdmin('user_alice', config), false);
    assert.strictEqual(WorkspaceMembership.isUserAdmin('user_admin', config), true);

    // Remove Alice
    config = WorkspaceMembership.removeMember(config, 'user_alice');
    assert.strictEqual(config.members.length, 1);
    assert.strictEqual(WorkspaceMembership.isAuthorAllowed('user_alice', config), false);
  });

  it('encodes and decodes 1-click workspace invitation hashes accurately', () => {
    const hash = WorkspaceMembership.createInviteHash({
      workspaceId: 'ws_kth_research',
      repo: 'sysoce/git-chat',
      branch: 'git-chat',
      provider: 'gita',
      policy: 'invite_only',
      salt: 'custom_salt_9988',
    });

    assert.ok(typeof hash === 'string' && hash.length > 10);

    const parsed = WorkspaceMembership.parseInviteHash(hash);
    assert.ok(parsed !== null);
    assert.strictEqual(parsed?.workspaceId, 'ws_kth_research');
    assert.strictEqual(parsed?.repo, 'sysoce/git-chat');
    assert.strictEqual(parsed?.branch, 'git-chat');
    assert.strictEqual(parsed?.provider, 'gita');
    assert.strictEqual(parsed?.policy, 'invite_only');
    assert.strictEqual(parsed?.salt, 'custom_salt_9988');
  });
});
