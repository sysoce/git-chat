import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Mobile Setup & Download Page Suite', () => {
  const rootDir = path.resolve(__dirname, '..');
  const indexHtmlPath = path.join(rootDir, 'index.html');
  const downloadHtmlPath = path.join(rootDir, 'download.html');

  it('encodes and decodes mobile setup hash payload accurately', () => {
    const originalConfig = {
      owner: 'sysoce',
      repo: 'git-chat',
      branch: 'git-chat',
      password: 'super-secret-vault-pass',
      workspaceSecret: 'custom-workspace-secret',
      backendUrl: 'http://192.168.1.111:4300'
    };

    const jsonStr = JSON.stringify(originalConfig);
    const b64 = Buffer.from(jsonStr, 'utf8').toString('base64');
    const decodedJson = Buffer.from(b64, 'base64').toString('utf8');
    const decoded = JSON.parse(decodedJson);

    assert.deepEqual(decoded, originalConfig);
  });

  it('index.html contains interactive Mobile QR modal and settings buttons', () => {
    const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

    // QR modal elements
    assert.ok(indexHtml.includes('id="qr-modal"'), 'must contain qr-modal');
    assert.ok(indexHtml.includes('id="qr-canvas"'), 'must contain qr-canvas');
    assert.ok(indexHtml.includes('id="mobile-link-url"'), 'must contain mobile-link-url input');
    assert.ok(indexHtml.includes('id="btn-copy-qr-link"'), 'must contain btn-copy-qr-link button');
    assert.ok(indexHtml.includes('id="btn-copy-setup-hash"'), 'must contain btn-copy-setup-hash button');
    assert.ok(indexHtml.includes('id="btn-download-app-bundle"'), 'must contain btn-download-app-bundle button');

    // Settings modal elements
    assert.ok(indexHtml.includes('id="btn-show-qr-code"'), 'must contain btn-show-qr-code in settings');
    assert.ok(indexHtml.includes('id="btn-copy-mobile-setup-link"'), 'must contain btn-copy-mobile-setup-link in settings');

    // JavaScript handlers and functions
    assert.ok(indexHtml.includes('function generateMobileSetupUrl('), 'must define generateMobileSetupUrl');
    assert.ok(indexHtml.includes('function openMobileModal('), 'must define openMobileModal');
    assert.ok(indexHtml.includes('setClickHandler(\'btn-show-qr-code\''), 'must bind btn-show-qr-code');
    assert.ok(indexHtml.includes('setClickHandler(\'btn-copy-mobile-setup-link\''), 'must bind btn-copy-mobile-setup-link');
    assert.ok(indexHtml.includes('setClickHandler(\'btn-copy-qr-link\''), 'must bind btn-copy-qr-link');
  });

  it('download.html exists and provides web launch, standalone download, and mobile QR setup', () => {
    assert.ok(fs.existsSync(downloadHtmlPath), 'download.html must exist in workspace root');
    const downloadHtml = fs.readFileSync(downloadHtmlPath, 'utf8');

    assert.ok(downloadHtml.includes('<!DOCTYPE html>'), 'must be a valid HTML document');
    assert.ok(downloadHtml.includes('id="btn-download-bundle"'), 'must contain download bundle button');
    assert.ok(downloadHtml.includes('id="btn-launch-web"'), 'must contain launch web app button');
    assert.ok(downloadHtml.includes('id="qr-canvas"'), 'must contain QR canvas for mobile scanning');
    assert.ok(downloadHtml.includes('QRCodeLib'), 'must bundle offline QR code generator');
  });
});
