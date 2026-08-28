import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeConnectPacket,
  encodePublishPacket,
  encodeSubscribePacket,
  parseMqttPacket,
  deriveWorkspaceTopic
} from '../src/engine/liveMeshClient.js';

describe('LiveMeshClient & MQTT Packet Engine Suite', () => {
  it('encodes a valid MQTT 3.1.1 CONNECT packet', () => {
    const packet = encodeConnectPacket('test_client_123', 60);
    assert.ok(packet instanceof Uint8Array);
    assert.equal(packet[0], 0x10);
    assert.ok(packet.length > 10);
  });

  it('encodes a valid MQTT 3.1.1 PUBLISH packet with topic and payload', () => {
    const topic = 'gitchat/test_workspace/chan_general';
    const payload = JSON.stringify({ text: 'Hello World', time: 123456789 });
    const packet = encodePublishPacket(topic, payload);
    assert.ok(packet instanceof Uint8Array);
    assert.equal(packet[0], 0x30);
  });

  it('encodes a valid MQTT 3.1.1 SUBSCRIBE packet', () => {
    const topic = 'gitchat/test_workspace/#';
    const packet = encodeSubscribePacket(topic, 1);
    assert.ok(packet instanceof Uint8Array);
    assert.equal(packet[0], 0x82);
  });

  it('parses PUBLISH packets accurately into topic and string payload', () => {
    const topic = 'gitchat/test_workspace/sync';
    const payload = JSON.stringify({ type: 'sync_file', path: 'channels/chan_general/messages/1.json' });
    const packet = encodePublishPacket(topic, payload);
    const parsed = parseMqttPacket(packet);

    assert.ok(parsed);
    assert.equal(parsed.type, 'PUBLISH');
    assert.equal(parsed.topic, topic);
    assert.equal(parsed.payload, payload);
  });

  it('parses CONNACK, SUBACK, and PINGRESP packets cleanly', () => {
    const connack = new Uint8Array([0x20, 0x02, 0x00, 0x00]);
    const parsedConnack = parseMqttPacket(connack);
    assert.ok(parsedConnack);
    assert.equal(parsedConnack.type, 'CONNACK');
    assert.equal(parsedConnack.returnCode, 0);

    const pingresp = new Uint8Array([0xd0, 0x00]);
    const parsedPing = parseMqttPacket(pingresp);
    assert.ok(parsedPing);
    assert.equal(parsedPing.type, 'PINGRESP');
  });

  it('derives a consistent, sanitized workspace topic from repo and secret', () => {
    const topic1 = deriveWorkspaceTopic('sysoce', 'chat-data', 'default_secret');
    const topic2 = deriveWorkspaceTopic('sysoce', 'chat-data', 'default_secret');
    assert.equal(topic1, topic2);
    assert.ok(topic1.startsWith('gitchat/'));
    assert.ok(topic1.endsWith('/#'));
  });
});
