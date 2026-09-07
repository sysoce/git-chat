export interface HistoryEpochState {
  historyEpoch: number;
  historyResetAt?: number;
}

export interface EpochStampedPayload {
  epoch?: number;
  timestamp?: number;
}

export function normalizeHistoryEpoch(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1;
}

export function shouldIngestChatPayload(
  parsed: EpochStampedPayload | null | undefined,
  workspace: HistoryEpochState,
  relativePath = ''
): boolean {
  if (!parsed || typeof parsed !== 'object') return false;
  const msgEpoch = normalizeHistoryEpoch(parsed.epoch);
  if (msgEpoch < workspace.historyEpoch) return false;
  const isHistoryBlob = relativePath.includes('/messages/') || relativePath.includes('/threads/');
  if (
    isHistoryBlob &&
    workspace.historyResetAt &&
    Number(parsed.timestamp) > 0 &&
    Number(parsed.timestamp) < workspace.historyResetAt
  ) {
    return false;
  }
  return true;
}

export function applyIncomingWorkspaceEpoch(
  current: HistoryEpochState,
  incoming: { historyEpoch?: number; historyResetAt?: number }
): { next: HistoryEpochState; advanced: boolean; stale: boolean } {
  const incomingEpoch = normalizeHistoryEpoch(incoming.historyEpoch);
  if (incomingEpoch < current.historyEpoch) {
    return { next: current, advanced: false, stale: true };
  }
  if (incomingEpoch > current.historyEpoch) {
    return {
      next: {
        historyEpoch: incomingEpoch,
        historyResetAt: incoming.historyResetAt || current.historyResetAt,
      },
      advanced: true,
      stale: false,
    };
  }
  return {
    next: {
      historyEpoch: current.historyEpoch,
      historyResetAt: incoming.historyResetAt || current.historyResetAt,
    },
    advanced: false,
    stale: false,
  };
}

export function buildResetWorkspaceConfig(previous: HistoryEpochState, actorId?: string) {
  const now = Date.now();
  return {
    historyEpoch: normalizeHistoryEpoch(previous.historyEpoch) + 1,
    historyResetAt: now,
    historyResetBy: actorId || 'user_admin',
  };
}

export function filterFilesByEpoch<T extends { content?: string; path?: string; relativePath?: string }>(
  files: T[],
  workspace: HistoryEpochState
): T[] {
  return files.filter((file) => {
    const path = file.path || file.relativePath || '';
    if (!file.content) return true;
    try {
      const parsed = JSON.parse(file.content);
      return shouldIngestChatPayload(parsed, workspace, path);
    } catch {
      return true;
    }
  });
}
