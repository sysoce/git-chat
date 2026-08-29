export const DEFAULT_STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.services.mozilla.com:3478' },
];

export function getDefaultIceServers(): RTCIceServer[] {
  return [...DEFAULT_STUN_SERVERS];
}

export function parseIceServers(raw?: string): RTCIceServer[] {
  if (!raw || typeof raw !== 'string') {
    return getDefaultIceServers();
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed as RTCIceServer[];
    }
  } catch {}
  return getDefaultIceServers();
}
