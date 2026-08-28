// Lightweight zero-dependency MQTT 3.1.1 over WebSocket client engine for E2EE live mesh sync

export interface MqttPacket {
  type: 'CONNACK' | 'PUBLISH' | 'SUBACK' | 'PINGRESP' | 'UNKNOWN';
  topic?: string;
  payload?: string;
  returnCode?: number;
}

export function encodeConnectPacket(clientId: string, keepAliveSeconds: number = 60): Uint8Array {
  const enc = new TextEncoder();
  const idBytes = enc.encode(clientId);
  const proto = [0, 4, 0x4d, 0x51, 0x54, 0x54, 4, 2, Math.floor(keepAliveSeconds / 256), keepAliveSeconds % 256];
  const payload = [Math.floor(idBytes.length / 256), idBytes.length % 256, ...idBytes];
  const remLen = proto.length + payload.length;
  return new Uint8Array([0x10, remLen, ...proto, ...payload]);
}

export function encodePublishPacket(topic: string, message: string): Uint8Array {
  const enc = new TextEncoder();
  const topicBytes = enc.encode(topic);
  const msgBytes = enc.encode(message);
  const topicLen = topicBytes.length;
  const remLen = 2 + topicLen + msgBytes.length;
  
  const buf = new Uint8Array(2 + remLen);
  buf[0] = 0x30; // PUBLISH, QoS 0
  buf[1] = remLen;
  buf[2] = (topicLen >> 8) & 0xff;
  buf[3] = topicLen & 0xff;
  buf.set(topicBytes, 4);
  buf.set(msgBytes, 4 + topicLen);
  return buf;
}

export function encodeSubscribePacket(topic: string, packetId: number = 1): Uint8Array {
  const enc = new TextEncoder();
  const topicBytes = enc.encode(topic);
  const topicLen = topicBytes.length;
  const remLen = 2 + 2 + topicLen + 1; // packetId (2) + topicLen (2) + topic + QoS (1)
  
  const buf = new Uint8Array(2 + remLen);
  buf[0] = 0x82; // SUBSCRIBE, QoS 1
  buf[1] = remLen;
  buf[2] = (packetId >> 8) & 0xff;
  buf[3] = packetId & 0xff;
  buf[4] = (topicLen >> 8) & 0xff;
  buf[5] = topicLen & 0xff;
  buf.set(topicBytes, 6);
  buf[6 + topicLen] = 0x00; // Requested QoS 0
  return buf;
}

export function encodePingPacket(): Uint8Array {
  return new Uint8Array([0xc0, 0x00]);
}

export function parseMqttPacket(buf: Uint8Array): MqttPacket {
  if (!buf || buf.length === 0) return { type: 'UNKNOWN' };
  const packetType = (buf[0] >> 4) & 0x0f;

  if (packetType === 2) {
    // CONNACK
    return { type: 'CONNACK', returnCode: buf.length >= 4 ? buf[3] : 0 };
  }
  if (packetType === 3) {
    // PUBLISH
    const topicLen = (buf[2] << 8) | buf[3];
    const dec = new TextDecoder();
    const topic = dec.decode(buf.subarray(4, 4 + topicLen));
    const payload = dec.decode(buf.subarray(4 + topicLen));
    return { type: 'PUBLISH', topic, payload };
  }
  if (packetType === 9) {
    // SUBACK
    return { type: 'SUBACK' };
  }
  if (packetType === 13) {
    // PINGRESP
    return { type: 'PINGRESP' };
  }
  return { type: 'UNKNOWN' };
}

export function deriveWorkspaceTopic(owner: string, repo: string, secret?: string): string {
  const raw = `${(owner || 'sysoce').trim().toLowerCase()}/${(repo || 'chat-data').trim().toLowerCase()}/${(secret || '').trim()}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash) + raw.charCodeAt(i);
    hash |= 0;
  }
  const positiveHash = Math.abs(hash).toString(36);
  return `gitchat/${positiveHash}/#`;
}
