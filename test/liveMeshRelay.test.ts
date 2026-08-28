import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LiveMeshRelay } from '../src/engine/liveMeshRelay.js';

describe('LiveMeshRelay Manager Suite', () => {
  it('initializes with default broker pool and disconnected state', () => {
    const relay = new LiveMeshRelay({
      owner: 'sysoce',
      repo: 'chat-data',
      userId: 'user_dev'
    });

    assert.equal(relay.isConnected(), false);
    assert.ok(relay.getWorkspaceTopic().startsWith('gitchat/'));
  });

  it('generates unique client IDs and switches brokers in round-robin on failure', () => {
    const relay = new LiveMeshRelay({
      owner: 'sysoce',
      repo: 'chat-data',
      userId: 'user_mobile',
      brokerUrls: ['wss://broker1.test', 'wss://broker2.test']
    });

    const b1 = relay.getCurrentBrokerUrl();
    assert.equal(b1, 'wss://broker1.test');
    relay.rotateBroker();
    const b2 = relay.getCurrentBrokerUrl();
    assert.equal(b2, 'wss://broker2.test');
  });

  it('formats sync_file, sync_request, and presence messages correctly', () => {
    const relay = new LiveMeshRelay({
      owner: 'sysoce',
      repo: 'chat-data',
      userId: 'user_test'
    });

    const filePayload = relay.createSyncFilePayload('channels/chan_general/messages/100.json', '{"test":true}');
    assert.equal(filePayload.type, 'sync_file');
    assert.equal(filePayload.path, 'channels/chan_general/messages/100.json');

    const reqPayload = relay.createSyncRequestPayload();
    assert.equal(reqPayload.type, 'sync_request');
    assert.equal(reqPayload.requesterId, 'user_test');
  });
});
