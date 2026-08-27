import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { detectGitConfig, createChatCommit } from '../backend/chatGitPlumbing';
import { generateQrMatrix } from '../qr/qrEncoder';
import { renderQrToTerminal } from '../qr/qrRenderer';
import type { ChatWorkspaceConfig, ChatUser, ChatMessage } from '../types/chat';

const execFileAsync = promisify(execFile);

export interface SetupResult {
  remoteUrl: string;
  owner?: string;
  repo?: string;
  branch: string;
  setupUrl: string;
  qrTerminal: string;
}

export async function detectGitHubToken(): Promise<string | undefined> {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim();
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN.trim();
  try {
    const { stdout } = await execFileAsync('gh', ['auth', 'token']);
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function runSetupWizard(workspaceRoot: string, port = 4300): Promise<SetupResult> {
  const gitConfig = await detectGitConfig(workspaceRoot);
  const token = await detectGitHubToken();
  const remoteUrl = gitConfig.remoteUrl || 'git@github.com:sysoce/git-chat.git';
  const owner = gitConfig.info?.owner || 'sysoce';
  const repo = gitConfig.info?.repo || 'git-chat';
  const branch = 'git-chat';

  // 1. Prepare default workspace configuration
  const workspaceConfig: ChatWorkspaceConfig = {
    name: 'Git-Chat Workspace',
    description: 'Serverless Slack powered by Git data sync',
    defaultChannelId: 'chan_general',
    createdAt: Date.now(),
    version: '1.0.0',
    channels: [
      { id: 'chan_general', name: 'general', topic: 'Company-wide announcements and work-based matters', isPrivate: false },
      { id: 'chan_talk_to_a_human', name: 'Talk to a Human', topic: 'Always-open direct channel with Human', isPrivate: false },
      { id: 'chan_engineering', name: 'engineering', topic: 'Architecture, PRs, CI/CD, and technical discussions', isPrivate: false },
      { id: 'chan_random', name: 'random', topic: 'Non-work banter, water cooler chats, and fun links', isPrivate: false },
    ],
  };

  const adminUser: ChatUser = {
    id: 'user_admin',
    name: 'Admin',
    avatar: '⚡',
    role: 'admin',
  };

  const agentUser: ChatUser = {
    id: 'agent_human',
    name: 'Human',
    avatar: '👤',
    role: 'agent',
    isBot: true,
  };

  const welcomeMessage: ChatMessage = {
    id: 'msg_welcome_001',
    channelId: 'chan_general',
    author: {
      id: 'agent_human',
      name: 'Human',
      avatar: '👤',
      isBot: true,
    },
    content: `👋 **Welcome to git-chat!**\n\nThis entire workspace is synced peer-to-peer over your Git repository on branch \`refs/heads/${branch}\`.\n- **Zero Central Servers Required**\n- **Zero Merge Conflicts** (discrete atomic files)\n- **Strict Isolation**: localhost users push only chat data, leaving system code intact.\n\nType \`/help\`, tag \`@Human\`, or visit the **#Talk to a Human** channel to get started!`,
    timestamp: Date.now(),
  };

  const humanChanWelcomeMessage: ChatMessage = {
    id: 'msg_human_welcome_001',
    channelId: 'chan_talk_to_a_human',
    author: {
      id: 'agent_human',
      name: 'Human',
      avatar: '👤',
      isBot: true,
    },
    content: `👋 Hello! I am **Human**, your built-in autonomous AI partner. Ask me anything here, brainstorm ideas, or get help with your code and tasks!`,
    timestamp: Date.now(),
  };

  const stagedFiles = [
    { relativePath: 'workspace.json', content: JSON.stringify(workspaceConfig, null, 2) },
    { relativePath: 'users/user_admin.json', content: JSON.stringify(adminUser, null, 2) },
    { relativePath: 'users/agent_human.json', content: JSON.stringify(agentUser, null, 2) },
    { relativePath: 'presence/user_admin.json', content: JSON.stringify({ userId: 'user_admin', status: 'online', emoji: '💻', lastSeen: Date.now() }, null, 2) },
    { relativePath: 'presence/agent_human.json', content: JSON.stringify({ userId: 'agent_human', status: 'online', emoji: '👤', lastSeen: Date.now(), currentTask: 'Active in #Talk to a Human' }, null, 2) },
    { relativePath: 'channels/chan_general/meta.json', content: JSON.stringify(workspaceConfig.channels[0], null, 2) },
    { relativePath: 'channels/chan_talk_to_a_human/meta.json', content: JSON.stringify(workspaceConfig.channels[1], null, 2) },
    { relativePath: 'channels/chan_engineering/meta.json', content: JSON.stringify(workspaceConfig.channels[2], null, 2) },
    { relativePath: 'channels/chan_random/meta.json', content: JSON.stringify(workspaceConfig.channels[3], null, 2) },
    { relativePath: `channels/chan_general/messages/${Date.now()}_agent_human_msg-001.json`, content: JSON.stringify(welcomeMessage, null, 2) },
    { relativePath: `channels/chan_talk_to_a_human/messages/${Date.now()}_agent_human_msg-002.json`, content: JSON.stringify(humanChanWelcomeMessage, null, 2) },
  ];

  // 2. Commit initial workspace onto refs/heads/git-chat with isolated staging
  try {
    await createChatCommit({
      workspaceRoot,
      activeUserId: 'user_admin',
      branch,
      files: stagedFiles,
      message: 'chore: initialize git-chat workspace structure with default channels',
      isWorkspaceInit: true,
    });
  } catch (err: any) {
    // If local git commit fails (e.g. non-git environment), continue to payload creation
  }

  // 3. Build setup hash payload
  const setupPayload = {
    owner,
    repo,
    branch,
    token: token || '',
    remoteUrl,
  };

  const encodedPayload = Buffer.from(JSON.stringify(setupPayload)).toString('base64');
  const setupUrl = `http://localhost:${port}/#setup=${encodedPayload}`;

  const qrMatrix = generateQrMatrix(setupUrl);
  const qrTerminal = renderQrToTerminal(qrMatrix);

  return {
    remoteUrl,
    owner,
    repo,
    branch,
    setupUrl,
    qrTerminal,
  };
}
