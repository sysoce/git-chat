import type { P2PSignalMessage } from './types.js';

export async function postSignalToLan(baseUrl: string, signal: P2PSignalMessage): Promise<boolean> {
  const url = `${baseUrl.replace(/\/+$/, '')}/api/p2p/signal`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signal),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchSignalsFromLan(baseUrl: string, recipientId?: string): Promise<P2PSignalMessage[]> {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const url = recipientId
    ? `${cleanBase}/api/p2p/signal?recipientId=${encodeURIComponent(recipientId)}`
    : `${cleanBase}/api/p2p/signal`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { ok?: boolean; signals?: P2PSignalMessage[] };
    return data.signals || [];
  } catch {
    return [];
  }
}

export function formatSignalTopic(workspaceTopic: string): string {
  return workspaceTopic.replace('/#', '/signals');
}
