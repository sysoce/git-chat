import * as path from 'node:path';
import { runSetupWizard } from './setupWizard';
import { startGitChatServer } from '../server/server';

async function main() {
  const args = process.argv.slice(2);
  let command = args[0] || 'start';
  let port = 4300;
  let host = '0.0.0.0';
  let dir = process.cwd();

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === 'setup') command = 'setup';
    else if (a === 'start') command = 'start';
    else if ((a === '--port' || a === '-p') && args[i + 1]) port = Number(args[++i]);
    else if ((a === '--host' || a === '-h') && args[i + 1]) host = args[++i]!;
    else if ((a === '--dir' || a === '-d') && args[i + 1]) dir = path.resolve(args[++i]!);
  }

  if (command === 'setup') {
    console.log('🚀 Setting up git-chat workspace and isolated data branch...');
    const res = await runSetupWizard(dir, port);
    console.log('\n======================================================');
    console.log(' 💬  git-chat Workspace Setup Complete!');
    console.log('======================================================');
    console.log(` ▸ Remote URL:    ${res.remoteUrl}`);
    console.log(` ▸ Data Branch:   refs/heads/${res.branch}`);
    console.log(` ▸ Quick Setup:   ${res.setupUrl}\n`);
    console.log(' Scan this QR code to connect mobile / browser:');
    console.log(res.qrTerminal);
    console.log('------------------------------------------------------');
    console.log(' 💡 Tip: Open the setup link in your browser or run:');
    console.log('    npm start');
    console.log('======================================================\n');
    return;
  }

  // Default: start local server
  startGitChatServer({ port, host, workspaceRoot: dir });
}

void main();
