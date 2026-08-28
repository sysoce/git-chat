import { spawn, type ChildProcess } from 'node:child_process';
import type { TunnelInstance } from './tunnelTypes';

export function spawnSshTunnel(
  args: string[],
  regex: RegExp,
  timeoutMs: number
): Promise<TunnelInstance | null> {
  return new Promise((resolve) => {
    let proc: ChildProcess | null = null;
    let resolved = false;

    try {
      proc = spawn('ssh', args, {
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
      const match = data.toString().match(regex);
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
