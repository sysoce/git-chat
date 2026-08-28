import type { ServerResponse } from 'node:http';

export class SseEmitter {
  private readonly clients = new Set<ServerResponse>();
  private heartbeatTimer?: NodeJS.Timeout;

  constructor() {
    this.startHeartbeat();
  }

  addClient(res: ServerResponse): void {
    res.socket?.setTimeout(0);
    res.socket?.setNoDelay(true);
    res.socket?.setKeepAlive(true, 10000);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
    });
    res.write('retry: 3000\n\n');
    res.write(`data: ${JSON.stringify({ type: 'connected', time: Date.now() })}\n\n`);

    this.clients.add(res);
    res.on('close', () => {
      this.clients.delete(res);
    });
  }

  broadcast(event: string, data: unknown): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.clients) {
      try {
        client.write(payload);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  broadcastFiles(files: Array<{ relativePath: string; content: string }>): void {
    if (!files || files.length === 0) return;
    this.broadcast('sync_files', { files, timestamp: Date.now() });
  }

  getClientCount(): number {
    return this.clients.size;
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      for (const client of this.clients) {
        try {
          client.write(': ping\n\n');
        } catch {
          this.clients.delete(client);
        }
      }
    }, 15000);
    if (this.heartbeatTimer && typeof (this.heartbeatTimer as any).unref === 'function') {
      (this.heartbeatTimer as any).unref();
    }
  }

  close(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    for (const c of this.clients) {
      try {
        c.end();
      } catch {}
    }
    this.clients.clear();
  }
}
