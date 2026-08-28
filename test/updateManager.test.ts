import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSemver,
  isNewerVersion,
  CLIENT_VERSION,
} from '../src/engine/version';
import {
  isAutoUpdateEnabled,
  setAutoUpdateEnabled,
  processVersionCheck,
  FIREFOX_PRIMARY_PATH,
  FIREFOX_SDCARD_PATH,
  type AppUpdateState,
} from '../src/engine/updateManager';

describe('Version & Semver Comparison Suite', () => {
  it('correctly parses semver strings with or without leading v', () => {
    assert.deepEqual(parseSemver('1.2.3'), [1, 2, 3]);
    assert.deepEqual(parseSemver('v2.0.1'), [2, 0, 1]);
    assert.deepEqual(parseSemver('1.0.0-beta.1'), [1, 0, 0]);
    assert.deepEqual(parseSemver(''), [0, 0, 0]);
    assert.deepEqual(parseSemver(undefined as unknown as string), [0, 0, 0]);
  });

  it('accurately identifies newer versions across major, minor, and patch', () => {
    assert.equal(isNewerVersion('1.0.1', '1.0.0'), true);
    assert.equal(isNewerVersion('1.1.0', '1.0.9'), true);
    assert.equal(isNewerVersion('2.0.0', '1.9.9'), true);

    assert.equal(isNewerVersion('1.0.0', '1.0.0'), false);
    assert.equal(isNewerVersion('0.9.9', '1.0.0'), false);
    assert.equal(isNewerVersion('1.0.0', '1.0.1'), false);
    assert.equal(isNewerVersion('', '1.0.0'), false);
  });
});

describe('Update Manager Suite', () => {
  it('defaults isAutoUpdateEnabled to true when localStorage is empty', () => {
    const originalStorage = globalThis.localStorage;
    const store = new Map<string, string>();
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    };

    try {
      assert.equal(isAutoUpdateEnabled(), true);
      setAutoUpdateEnabled(false);
      assert.equal(isAutoUpdateEnabled(), false);
      setAutoUpdateEnabled(true);
      assert.equal(isAutoUpdateEnabled(), true);
    } finally {
      (globalThis as unknown as { localStorage: unknown }).localStorage = originalStorage;
    }
  });

  it('triggers auto-download and marks downloaded when auto-update is ON', () => {
    const originalStorage = globalThis.localStorage;
    const store = new Map<string, string>();
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    };

    let downloadedUrl = '';
    const mockDownloader = (url: string) => { downloadedUrl = url; };

    try {
      const state: AppUpdateState = {
        availableUpdateVersion: undefined,
        updateDownloaded: false,
        isUpdateModalOpen: false,
      };

      const res = processVersionCheck(state, '1.1.0', '1.0.0', mockDownloader);

      assert.equal(res.hasUpdate, true);
      assert.equal(res.autoDownloaded, true);
      assert.equal(state.availableUpdateVersion, '1.1.0');
      assert.equal(state.updateDownloaded, true);
      assert.equal(state.isUpdateModalOpen, true);
      assert.equal(downloadedUrl, '/download');
    } finally {
      (globalThis as unknown as { localStorage: unknown }).localStorage = originalStorage;
    }
  });

  it('does not auto-download when auto-update is OFF', () => {
    const originalStorage = globalThis.localStorage;
    const store = new Map<string, string>();
    store.set('git_chat_auto_update', 'false');
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    };

    let downloadCount = 0;
    const mockDownloader = () => { downloadCount++; };

    try {
      const state: AppUpdateState = {
        availableUpdateVersion: undefined,
        updateDownloaded: false,
        isUpdateModalOpen: false,
      };

      const res = processVersionCheck(state, '1.1.0', '1.0.0', mockDownloader);

      assert.equal(res.hasUpdate, true);
      assert.equal(res.autoDownloaded, false);
      assert.equal(state.availableUpdateVersion, '1.1.0');
      assert.equal(state.updateDownloaded, false);
      assert.equal(downloadCount, 0);
    } finally {
      (globalThis as unknown as { localStorage: unknown }).localStorage = originalStorage;
    }
  });

  it('exposes valid Firefox Android and SD Card file paths for git-chat', () => {
    assert.equal(FIREFOX_PRIMARY_PATH, 'file:///storage/emulated/0/Download/git-chat.html');
    assert.equal(FIREFOX_SDCARD_PATH, 'file:///sdcard/Download/git-chat.html');
  });
});
