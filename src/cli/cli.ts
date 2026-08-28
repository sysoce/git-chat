import * as path from 'node:path';
import { runSetupWizard } from './setupWizard';
import { startGitChatServer } from '../server/server';
import { startTunnel } from '../server/tunnel';
import { generateQrMatrix } from '../qr/qrEncoder';
import { renderQrToTerminal } from '../qr/qrRenderer';

async function main() {
  const args = process.argv.slice(2);
  let command = args[0] || 'start';
  let port = 4300;
  let host = '0.0.0.0';
  let dir = process.cwd();
  let enableTunnel = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === 'setup') command = 'setup';
    else if (a === 'reset' || a === 'clean') command = 'reset';
    else if (a === 'start') command = 'start';
    else if (a === '--tunnel' || a === '-t') enableTunnel = true;
    else if ((a === '--port' || a === '-p') && args[i + 1]) port = Number(args[++i]);
    else if ((a === '--host' || a === '-h') && args[i + 1]) host = args[++i]!;
    else if ((a === '--dir' || a === '-d') && args[i + 1]) dir = path.resolve(args[++i]!);
  }

  if (command === 'reset' || command === 'clean') {
    console.log('🧹 Resetting git-chat workspace to a clean slate...');
    const { resetWorkspace } = await import('./resetWorkspace.js');
    const res = await resetWorkspace(dir, port);
    console.log('\n======================================================');
    console.log(' ✨  git-chat Clean Slate Reset Complete!');
    console.log('======================================================');
    console.log(` ▸ Remote URL:    ${res.remoteUrl}`);
    console.log(` ▸ Data Branch:   refs/heads/${res.branch}`);
    console.log(` ▸ Clean Setup:   ${res.setupUrl}\n`);
    console.log(' Scan this QR code to connect mobile / browser:');
    console.log(res.qrTerminal);
    console.log('------------------------------------------------------\n');
    return;
  }

  if (command === 'setup') {
    console.log('🚀 Setting up git-chat workspace and mobile pairing...');
    const res = await runSetupWizard({ workspaceRoot: dir, port, enableTunnel });
    console.log('\n======================================================');
    console.log(' 💬  git-chat Workspace Setup Complete!');
    console.log('======================================================');
    console.log(` ▸ Remote URL:    ${res.remoteUrl}`);
    console.log(` ▸ GitHub Pages:  ${res.githubPagesUrl}`);
    if (res.tunnelUrl) console.log(` ▸ HTTPS Tunnel:  ${res.tunnelUrl}`);
    console.log(` ▸ Local LAN:     ${res.mobileUrl}\n`);
    console.log(' Scan this QR code with your phone camera:');
    console.log(res.qrTerminal);
    console.log('------------------------------------------------------');
    console.log(' 💡 Open the link above in any browser or run: npm start');
    console.log('======================================================\n');
    return;
  }

  // Default: start local server
  startGitChatServer({ port, host, workspaceRoot: dir });

  if (enableTunnel) {
    console.log('🚇 Establishing encrypted public HTTPS tunnel...');
    startTunnel(port).then((tun) => {
      if (tun) {
        console.log(`\n🎉 Public HTTPS Tunnel Ready: ${tun.url}`);
        const setupPayload = Buffer.from(
          JSON.stringify({
            owner: 'sysoce',
            repo: 'chat-data',
            branch: 'master',
            backendUrl: tun.url,
            password: 'git-chat-open',
          })
        ).toString('base64');
        const tunQr = renderQrToTerminal(generateQrMatrix(`https://sysoce.github.io/git-chat/#setup=${setupPayload}`));
        console.log(' Scan QR code to connect mobile via HTTPS tunnel:');
        console.log(tunQr);
      } else {
        console.warn('⚠️ Could not establish SSH tunnel, falling back to local LAN.');
      }
    });
  }
}

void main();
