import {
  FIREFOX_PRIMARY_PATH,
  FIREFOX_SDCARD_PATH,
  isAutoUpdateEnabled,
} from './updateManager';

export interface UpdateModalViewModel {
  isOpen: boolean;
  currentVersion: string;
  availableVersion?: string;
  isDownloaded?: boolean;
  autoUpdateEnabled?: boolean;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderUpdateModal(vm: UpdateModalViewModel): string {
  if (!vm.isOpen) return '';

  const autoUpdate = vm.autoUpdateEnabled ?? isAutoUpdateEnabled();
  const updateVer = vm.availableVersion || 'Latest';
  const isDownloaded = Boolean(vm.isDownloaded);

  return `
    <div class="modal-overlay open" id="update-modal">
      <div class="modal-card update-modal-card" style="max-width: 460px;">
        <div class="modal-sheet-handle"></div>
        <div class="modal-title" style="display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="update-badge" style="background:${isDownloaded ? 'var(--accent, #007a5a)' : '#1264a3'}; color:#ffffff; padding:3px 8px; border-radius:12px; font-size:11px; font-weight:700;">
              ${isDownloaded ? '🚀 Update Downloaded' : '⚡ Update Available'}
            </span>
          </div>
          <button class="close-btn" id="btn-close-update-modal" aria-label="Close">×</button>
        </div>

        <div style="padding:14px 0 10px 0; display:flex; flex-direction:column; gap:12px;">
          <h3 style="font-size:16px; font-weight:700; color:var(--text-heading, #ffffff); margin:0;">
            ${isDownloaded ? `Version v${escapeHtml(updateVer)} is Ready` : `Version v${escapeHtml(updateVer)} Available`}
          </h3>
          <p style="font-size:13px; color:var(--text-muted, #ababad); margin:0;">
            Current: <span style="background:var(--bg-card, #222529); padding:2px 6px; border-radius:4px; font-family:var(--font-mono); font-size:12px;">v${escapeHtml(vm.currentVersion)}</span> &rarr;
            New: <span style="background:rgba(0,122,90,0.2); color:#2eb886; padding:2px 6px; border-radius:4px; font-family:var(--font-mono); font-size:12px; font-weight:bold;">v${escapeHtml(updateVer)}</span>
          </p>

          ${
            isDownloaded
              ? `
            <div style="background:rgba(0,122,90,0.15); border:1px solid rgba(46,184,134,0.3); border-radius:8px; padding:12px; display:flex; gap:10px; align-items:flex-start;">
              <span style="font-size:20px; line-height:1;">📥</span>
              <div style="font-size:12px; line-height:1.4;">
                <strong style="color:#2eb886; display:block; margin-bottom:2px;">New bundle saved to Downloads</strong>
                <span style="color:var(--text-main, #d1d2d3);">Open the updated local file in Firefox to switch to the new version.</span>
              </div>
            </div>

            <div style="display:flex; flex-direction:column; gap:8px; margin-top:4px;">
              <a
                href="${FIREFOX_PRIMARY_PATH}"
                class="btn-primary"
                style="text-align:center; text-decoration:none; padding:10px 14px; font-size:13px; font-weight:600; display:block; border-radius:6px;"
                target="_blank"
                rel="noopener"
              >
                🦊 Open in Firefox (Primary)
              </a>
              <a
                href="${FIREFOX_SDCARD_PATH}"
                class="btn-secondary"
                style="text-align:center; text-decoration:none; padding:8px 12px; font-size:12px; display:block; border-radius:6px; background:var(--bg-card, #222529); color:var(--text-muted, #ababad); border:1px solid var(--border, #383f45);"
                target="_blank"
                rel="noopener"
              >
                📂 Alt SD Card Link
              </a>
              <button
                type="button"
                id="btn-copy-firefox-link"
                class="btn-secondary"
                data-copy-text="${FIREFOX_PRIMARY_PATH}"
                style="padding:8px 12px; font-size:12px; cursor:pointer; border-radius:6px; background:var(--bg-card, #222529); color:var(--text-main, #d1d2d3); border:1px solid var(--border, #383f45);"
              >
                📋 Copy Firefox Path
              </button>
            </div>

            <div style="font-size:11px; color:var(--text-dim, #717274); line-height:1.4; background:var(--code-bg, #111214); padding:8px 10px; border-radius:6px; border:1px solid var(--border-light, #2e343b);">
              <strong style="color:var(--text-muted, #ababad);">Tip for Firefox:</strong> Tap the button above, or copy the path and paste it directly into your Firefox address bar.
            </div>
          `
              : `
            <div style="margin-top:6px;">
              <button type="button" id="btn-manual-download-update" class="btn-primary" style="width:100%; padding:10px; font-size:13px; font-weight:600;">
                📥 Download New File (v${escapeHtml(updateVer)})
              </button>
            </div>
          `
          }

          <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-card, #222529); padding:10px 12px; border-radius:8px; border:1px solid var(--border-light, #2e343b); margin-top:6px;">
            <div>
              <strong style="font-size:12px; color:var(--text-heading, #ffffff); display:block;">Auto-Update</strong>
              <span style="font-size:11px; color:var(--text-dim, #717274);">Automatically download new versions when available</span>
            </div>
            <label class="switch" style="position:relative; display:inline-block; width:36px; height:20px; flex-shrink:0;">
              <input
                type="checkbox"
                id="toggle-auto-update"
                ${autoUpdate ? 'checked' : ''}
                style="opacity:0; width:0; height:0;"
              />
              <span class="slider round" style="position:absolute; cursor:pointer; inset:0; background-color:${autoUpdate ? 'var(--accent, #007a5a)' : '#3f3f46'}; border-radius:20px; transition:0.2s;"></span>
            </label>
          </div>
        </div>

        <div style="display:flex; justify-content:flex-end; border-top:1px solid var(--border, #383f45); padding-top:10px; margin-top:4px;">
          <button class="btn-secondary" id="btn-dismiss-update" style="padding:6px 14px; font-size:12px;">Close</button>
        </div>
      </div>
    </div>
  `;
}
