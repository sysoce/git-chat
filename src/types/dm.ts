/**
 * Deterministic 1-on-1 Direct Message Channel helpers
 */

/**
 * Creates a deterministic 1-on-1 Direct Message channel ID between two users
 */
export function getDmChannelId(userAId: string, userBId: string): string {
  const sorted = [userAId, userBId].sort();
  return `chan_dm_${sorted[0]}__${sorted[1]}`;
}

/**
 * Parses the participant user IDs from a DM channel ID
 */
export function parseDmChannelUsers(channelId: string): [string, string] | null {
  if (!channelId || !channelId.startsWith('chan_dm_')) return null;
  const parts = channelId.slice(8).split('__');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return [parts[0], parts[1]];
}
