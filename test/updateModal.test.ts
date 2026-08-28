import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderUpdateModal,
  type UpdateModalViewModel,
} from '../src/engine/updateModal';
import {
  FIREFOX_PRIMARY_PATH,
  FIREFOX_SDCARD_PATH,
} from '../src/engine/updateManager';

describe('Update Modal Renderer Suite', () => {
  it('returns empty string when modal is not open', () => {
    const vm: UpdateModalViewModel = {
      isOpen: false,
      currentVersion: '1.0.0',
      availableVersion: '1.0.1',
      isDownloaded: false,
      autoUpdateEnabled: true,
    };
    assert.equal(renderUpdateModal(vm), '');
  });

  it('renders downloaded state with primary Firefox and SD card links, copy button, and tip', () => {
    const vm: UpdateModalViewModel = {
      isOpen: true,
      currentVersion: '1.0.0',
      availableVersion: '1.0.1',
      isDownloaded: true,
      autoUpdateEnabled: true,
    };
    const html = renderUpdateModal(vm);

    assert.match(html, /id="update-modal"/);
    assert.match(html, /Update Downloaded/);
    assert.match(html, /Version v1\.0\.1 is Ready/);
    assert.match(html, /v1\.0\.0/);
    assert.match(html, /v1\.0\.1/);
    assert.ok(html.includes(`href="${FIREFOX_PRIMARY_PATH}"`));
    assert.ok(html.includes(`href="${FIREFOX_SDCARD_PATH}"`));
    assert.ok(html.includes(`data-copy-text="${FIREFOX_PRIMARY_PATH}"`));
    assert.match(html, /Open in Firefox \(Primary\)/);
    assert.match(html, /Alt SD Card Link/);
    assert.match(html, /Copy Firefox Path/);
    assert.match(html, /Tip for Firefox:/);
    assert.match(html, /checked/);
  });

  it('renders available (not yet downloaded) state with manual download action', () => {
    const vm: UpdateModalViewModel = {
      isOpen: true,
      currentVersion: '1.0.0',
      availableVersion: '1.0.1',
      isDownloaded: false,
      autoUpdateEnabled: false,
    };
    const html = renderUpdateModal(vm);

    assert.match(html, /id="update-modal"/);
    assert.match(html, /Update Available/);
    assert.match(html, /Version v1\.0\.1 Available/);
    assert.match(html, /btn-manual-download-update/);
    assert.ok(!html.includes('id="toggle-auto-update" checked'));
  });
});
