import type { IncomingMessage, ServerResponse } from 'node:http';
import type { P2PSignalMessage } from '../p2p/types.js';

export class P2PSignalStore {
  private signals: P2PSignalMessage[] = [];

  push(signal: P2PSignalMessage): void {
    this.signals.push(signal);
    this.pruneExpired(60_000);
  }

  getSignals(recipientId?: string): P2PSignalMessage[] {
    const matched: P2PSignalMessage[] = [];
    const remaining: P2PSignalMessage[] = [];
    for (const s of this.signals) {
      if (!recipientId || !s.recipientId || s.recipientId === recipientId) {
        matched.push(s);
      } else {
        remaining.push(s);
      }
    }
    this.signals = remaining;
    return matched;
  }

  pruneExpired(ttlMs = 60_000): void {
    const now = Date.now();
    this.signals = this.signals.filter((s) => now - s.timestamp <= ttlMs);
  }

  clear(): void {
    this.signals = [];
  }
}

export const globalSignalStore = new P2PSignalStore();

export async function handleP2PSignalRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  url: URL,
  store: P2PSignalStore = globalSignalStore
): Promise<boolean> {
  if (pathname !== '/api/p2p/signal') return false;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Active-User');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }

  if (req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const signal = JSON.parse(body) as P2PSignalMessage;
      if (!signal.timestamp) signal.timestamp = Date.now();
      store.push(signal);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON signal payload' }));
    }
    return true;
  }

  if (req.method === 'GET') {
    const recipientId = url.searchParams.get('recipientId') || undefined;
    const signals = store.getSignals(recipientId);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify({ ok: true, signals }));
    return true;
  }

  return false;
}
