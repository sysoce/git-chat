export const CLIENT_VERSION = '1.0.0';

export function parseSemver(ver: string): [number, number, number] {
  if (!ver || typeof ver !== 'string') return [0, 0, 0];
  const clean = ver.trim().replace(/^v/, '').split('-')[0] || '';
  const parts = clean.split('.').map((p) => {
    const num = parseInt(p, 10);
    return Number.isNaN(num) ? 0 : num;
  });
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

export function isNewerVersion(remoteVersion: string, currentVersion: string = CLIENT_VERSION): boolean {
  if (!remoteVersion) return false;
  const remote = parseSemver(remoteVersion);
  const current = parseSemver(currentVersion);

  if (remote[0] > current[0]) return true;
  if (remote[0] < current[0]) return false;

  if (remote[1] > current[1]) return true;
  if (remote[1] < current[1]) return false;

  return remote[2] > current[2];
}
