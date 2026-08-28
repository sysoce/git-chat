import { CLIENT_VERSION, isNewerVersion } from './version';

export const AUTO_UPDATE_KEY = 'git_chat_auto_update';
export const FIREFOX_PRIMARY_PATH = 'file:///storage/emulated/0/Download/git-chat.html';
export const FIREFOX_SDCARD_PATH = 'file:///sdcard/Download/git-chat.html';

export interface AppUpdateState {
  availableUpdateVersion?: string;
  updateDownloaded?: boolean;
  isUpdateModalOpen?: boolean;
  autoUpdateEnabled?: boolean;
}

export interface VersionCheckResult {
  hasUpdate: boolean;
  autoDownloaded: boolean;
}

export function isAutoUpdateEnabled(): boolean {
  if (typeof localStorage === 'undefined') return true;
  return localStorage.getItem(AUTO_UPDATE_KEY) !== 'false';
}

export function setAutoUpdateEnabled(enabled: boolean): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(AUTO_UPDATE_KEY, String(enabled));
}

export function triggerBundleDownload(url = '/download', filename = 'git-chat.html'): void {
  if (typeof document === 'undefined') return;
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function processVersionCheck(
  state: AppUpdateState,
  remoteVersion: string,
  currentVersion: string = CLIENT_VERSION,
  downloader: (url: string, filename?: string) => void = triggerBundleDownload
): VersionCheckResult {
  const hasUpdate = isNewerVersion(remoteVersion, currentVersion);
  if (!hasUpdate) {
    return { hasUpdate: false, autoDownloaded: false };
  }

  state.availableUpdateVersion = remoteVersion;
  const autoUpdate = isAutoUpdateEnabled();
  state.autoUpdateEnabled = autoUpdate;

  if (autoUpdate) {
    downloader('/download', 'git-chat.html');
    state.updateDownloaded = true;
    state.isUpdateModalOpen = true;
    return { hasUpdate: true, autoDownloaded: true };
  }

  state.updateDownloaded = false;
  return { hasUpdate: true, autoDownloaded: false };
}

export async function checkForUpdates(
  apiBase: string,
  state: AppUpdateState,
  onUpdateDetected?: () => void
): Promise<boolean> {
  try {
    const url = apiBase ? `${apiBase.replace(/\/+$/, '')}/api/version` : '/api/version';
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return false;
    const data = (await res.json()) as { version?: string };
    if (!data?.version) return false;

    const result = processVersionCheck(state, data.version);
    if (result.hasUpdate && onUpdateDetected) {
      onUpdateDetected();
      return true;
    }
  } catch {
    // Server offline or pure standalone mode
  }
  return false;
}
