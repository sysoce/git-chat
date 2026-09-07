import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyIncomingWorkspaceEpoch,
  buildResetWorkspaceConfig,
  filterFilesByEpoch,
  shouldIngestChatPayload,
} from '../src/engine/syncIngestPolicy.js';

describe('historyEpoch ingest gate', () => {
  it('rejects messages from an older epoch', () => {
    assert.equal(
      shouldIngestChatPayload({ epoch: 1, timestamp: Date.now() }, { historyEpoch: 2 }, 'channels/chan_general/messages/x.json'),
      false
    );
    assert.equal(
      shouldIngestChatPayload({ epoch: 2, timestamp: Date.now() }, { historyEpoch: 2 }, 'channels/chan_general/messages/x.json'),
      true
    );
  });

  it('rejects pre-reset timestamps even when epoch is missing', () => {
    assert.equal(
      shouldIngestChatPayload(
        { timestamp: 1000 },
        { historyEpoch: 1, historyResetAt: 5000 },
        'channels/chan_general/messages/old.json'
      ),
      false
    );
  });

  it('advances workspace epoch and ignores stale workspace files', () => {
    const advanced = applyIncomingWorkspaceEpoch({ historyEpoch: 1 }, { historyEpoch: 3, historyResetAt: 99 });
    assert.equal(advanced.advanced, true);
    assert.equal(advanced.next.historyEpoch, 3);
    const stale = applyIncomingWorkspaceEpoch({ historyEpoch: 4 }, { historyEpoch: 2 });
    assert.equal(stale.stale, true);
    assert.equal(stale.next.historyEpoch, 4);
  });

  it('drops queued files below the current epoch', () => {
    const kept = filterFilesByEpoch([
      { relativePath: 'channels/a/messages/1.json', content: JSON.stringify({ epoch: 1, timestamp: 1 }) },
      { relativePath: 'channels/a/messages/2.json', content: JSON.stringify({ epoch: 2, timestamp: 9 }) },
    ], { historyEpoch: 2 });
    assert.equal(kept.length, 1);
    assert.ok(kept[0]!.relativePath?.endsWith('2.json'));
  });

  it('bumps epoch on reset', () => {
    const reset = buildResetWorkspaceConfig({ historyEpoch: 2 }, 'user_admin');
    assert.equal(reset.historyEpoch, 3);
    assert.ok(reset.historyResetAt);
  });
});
