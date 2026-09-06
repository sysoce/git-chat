import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(__dirname, '..');
const htmlPath = path.join(rootDir, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

describe('Standalone client operational controls', () => {
  it('uses one canonical workspace secret for encryption and pairing', () => {
    assert.ok(html.includes('function getEffectiveWorkspaceSecret()'));
    assert.ok(html.includes('return deriveConversationKey(channelId, getEffectiveWorkspaceSecret())'));
    assert.ok(html.includes('const meshSecret = getEffectiveWorkspaceSecret()'),
      'mesh routing and encryption must use the identical secret');
    assert.match(html, /workspaceSecret:\s*getEffectiveWorkspaceSecret\(\)/);
    assert.ok(html.includes('function getWorkspaceSecretCandidates()'));
    assert.ok(html.includes("'git-chat-open'"), 'legacy default must remain a decryption candidate');
    assert.ok(html.includes('`${config.owner}/${config.repo}`'), 'legacy repo identity must remain a candidate');
  });

  it('defines and uses decrypted-message search', () => {
    assert.ok(html.includes('async function decryptMessage('));
    assert.ok(html.includes('const dec = await decryptMessage(m, m.channelId)'));
    assert.ok(html.includes("channelName.toLowerCase().includes(needle)"));
    assert.ok(html.includes("authorName.toLowerCase().includes(needle)"));
    assert.ok(!html.includes("const dec = await decryptMessage(m, m.channelId);\n              if (dec) text = dec;\n            }\n            if (text && text.toLowerCase().includes(q))"),
      'old text-only search implementation must not return');
  });

  it('makes the connection indicator an operable mode toggle', () => {
    assert.match(html, /<button[^>]+id="mesh-status-indicator"/);
    assert.ok(html.includes('cyclePreferredMode()'));
    assert.ok(html.includes("'git_chat_preferred_transport'"));
    assert.ok(html.includes("setClickHandler('mesh-status-indicator'"));
    assert.ok(html.includes('id="btn-mob-connection"'));
  });

  it('stabilizes transport status changes before repainting the badge', () => {
    assert.ok(html.includes("this.displayMode = 'connecting'"));
    assert.ok(html.includes('scheduleUITransition(nextMode)'));
    assert.ok(html.includes('this.degradedSince = Date.now()'));
    assert.ok(html.includes('12000 - (Date.now() - this.degradedSince)'),
      'healthy status should survive a twelve-second reconnect grace period');
    assert.ok(html.includes('const delayMs = nextConnected ? 1500'),
      'new connections should be stable before display');
    assert.ok(html.includes('const mode = this.displayMode'));
  });

  it('coalesces queued presence and profile heartbeats', () => {
    assert.ok(html.includes("path.startsWith('presence/') || path.startsWith('users/')"));
    assert.ok(html.includes('seenReplaceable.has(path)'));
    assert.ok(html.includes('this.items = compacted'));
  });

  it('provides one explicit manual refresh across all transports', () => {
    assert.ok(html.includes('async function manualRefreshAll()'));
    assert.ok(html.includes("type: 'sync_request'"));
    assert.ok(html.includes('window.gistClient.poll()'));
    assert.ok(html.includes("setClickHandler('btn-sync-now', manualRefreshAll)"));
    assert.ok(html.includes("setClickHandler('btn-mob-sync'"));
    assert.match(html, /id="btn-sync-now"[^>]*>[\s\S]*?Refresh<\/button>/);
  });

  it('binds critical header controls before optional integrations', () => {
    const bindStart = html.indexOf('function bindEventListeners()');
    const criticalBind = html.indexOf('bindCriticalHeaderControls();', bindStart);
    const optionalS3 = html.indexOf("setClickHandler('btn-s3-status'", bindStart);
    assert.ok(bindStart > 0 && criticalBind > bindStart);
    assert.ok(criticalBind < optionalS3, 'critical controls must bind before optional integrations');
  });

  it('does not let backend identity overwrite a configured data repository', () => {
    assert.ok(html.includes("if (data.remote && (!config.owner || !config.repo))"));
    assert.ok(!html.includes("if (data.remote && (!config.owner || config.owner === 'sysoce'))"));
  });

  it('rejects local-bridge data from a different repository', () => {
    assert.ok(html.includes('localBridgeCompatible = !!bridgeWorkspace && bridgeWorkspace === selectedWorkspace'));
    assert.ok(html.includes('if (!localBridgeIdentityChecked || !localBridgeCompatible)'));
    assert.ok(html.includes('if (!localBridgeCompatible)'));
    assert.ok(html.includes('if (localBridgeCompatible)'));
  });

  it('scopes cached history to one repository and branch', () => {
    assert.ok(html.includes("'git_chat_cache_workspace'"));
    assert.ok(html.includes('cachedWorkspace !== currentWorkspace'));
    assert.ok(html.includes("const CACHE_SCHEMA_VERSION = '3'"));
  });

  it('migrates the known legacy app-repo default without discarding its local backup', () => {
    assert.ok(html.includes("localStorage.setItem('git_chat_legacy_messages_backup', savedMsgs)"));
    assert.ok(html.includes("config.repo = 'chat-data'"));
    assert.ok(html.includes('config.workspaceSchemaVersion = 2'));
  });

  it('removes credential-bearing setup hashes after applying them', () => {
    assert.ok(html.includes('window.history.replaceState(null, document.title'));
    assert.ok(html.includes('window.location.pathname + window.location.search'));
  });
});
