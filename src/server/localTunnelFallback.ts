import { spawn, type ChildProcess } from 'node:child_process';
import type { TunnelInstance } from './tunnelTypes';

export function spawnLocalTunnel(port: number, timeoutMs = 10000): Promise<TunnelInstance | null> {
  return new Promise((resolve) => {
    let proc: ChildProcess | null = null;
    let resolved = false;

    try {
      proc = spawn('npx', ['--yes', 'localtunnel', '--port', String(port)], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      resolve(null);
      return;
    }

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try { proc?.kill('SIGKILL'); } catch {}
        resolve(null);
      }
    }, timeoutMs);

    const onData = (data: Buffer) => {
      const match = data.toString().match(/https:\/\/[a-zA-Z0-9-]+\.loca\.lt/);
      if (match && !resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve({
          url: match[0],
          close: () => {
            try { proc?.kill('SIGKILL'); } catch {}
          },
        });
      }
    };

    proc.stdout?.on('data', onData);
    proc.stderr?.on('data', onData);
    proc.on('error', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve(null);
      }
    });
    proc.on('exit', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve(null);
      }
    });
  });
}
