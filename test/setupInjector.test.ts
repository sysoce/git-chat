import test from 'node:test';
import assert from 'node:assert/strict';
import { injectSetupIntoHtml, extractEmbeddedSetup } from '../src/engine/setupInjector';

test('SetupInjector Suite', async (t) => {
  const sampleHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Git-Chat</title>
</head>
<body>
  <h1>Git-Chat</h1>
</body>
</html>`;

  const setupPayload = {
    owner: 'sysoce',
    repo: 'git-chat',
    branch: 'git-chat',
    password: 'my-super-secure-vault-password-123',
    workspaceSecret: 'secret-xyz',
    backendUrl: 'http://192.168.1.111:4300',
    user: { id: 'user_dev', name: 'Developer', avatar: '💻' }
  };

  await t.test('injects embedded setup JSON script into head', () => {
    const injected = injectSetupIntoHtml(sampleHtml, setupPayload);
    assert.ok(injected.includes('<script id="embedded-setup-config" type="application/json">'), 'Must contain embedded-setup-config script tag');
    assert.ok(injected.includes('my-super-secure-vault-password-123'), 'Must contain the vault password');
    assert.ok(injected.includes('http://192.168.1.111:4300'), 'Must contain backendUrl');
  });

  await t.test('extracts embedded setup JSON correctly from HTML', () => {
    const injected = injectSetupIntoHtml(sampleHtml, setupPayload);
    const extracted = extractEmbeddedSetup(injected);
    assert.deepEqual(extracted, setupPayload, 'Extracted setup must match injected setup payload');
  });

  await t.test('returns null when extracting from HTML without embedded setup', () => {
    const extracted = extractEmbeddedSetup(sampleHtml);
    assert.equal(extracted, null, 'Must return null if no embedded setup is present');
  });

  await t.test('replaces existing embedded setup if already present', () => {
    const firstInjection = injectSetupIntoHtml(sampleHtml, setupPayload);
    const newPayload = { ...setupPayload, password: 'new-updated-password-456' };
    const secondInjection = injectSetupIntoHtml(firstInjection, newPayload);

    const extracted = extractEmbeddedSetup(secondInjection);
    assert.equal(extracted?.password, 'new-updated-password-456');
    // Ensure only one embedded script tag is present
    const occurrences = (secondInjection.match(/id="embedded-setup-config"/g) || []).length;
    assert.equal(occurrences, 1, 'Should only have one embedded-setup-config script tag');
  });
});
