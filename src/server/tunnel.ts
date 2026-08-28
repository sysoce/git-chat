import type { TunnelInstance } from './tunnelTypes';
import { spawnSshTunnel } from './sshTunnel';
import { spawnLocalTunnel } from './localTunnelFallback';

export type { TunnelInstance };

export async function startTunnel(port: number): Promise<TunnelInstance | null> {
  // Strategy 1: Pinggy via SSH (Fastest, zero-config, low-latency direct HTTPS)
  const pinggy = await spawnSshTunnel(
    [
      '-T',
      '-p', '443',
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=/dev/null',
      '-o', 'ServerAliveInterval=15',
      '-o', 'ServerAliveCountMax=3',
      '-R', `0:localhost:${port}`,
      'a.pinggy.io',
    ],
    /https:\/\/[a-zA-Z0-9-]+\.(free\.pinggy\.net|run\.pinggy-free\.link)/,
    6000
  );
  if (pinggy) return pinggy;

  // Strategy 2: localhost.run via SSH
  const lhr = await spawnSshTunnel(
    [
      '-T',
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=/dev/null',
      '-o', 'ServerAliveInterval=15',
      '-o', 'ServerAliveCountMax=3',
      '-R', `80:localhost:${port}`,
      'nokey@localhost.run',
    ],
    /https:\/\/[a-zA-Z0-9-]+\.lhr\.life/,
    8000
  );
  if (lhr) return lhr;

  // Strategy 3: localtunnel fallback
  return spawnLocalTunnel(port, 10000);
}
