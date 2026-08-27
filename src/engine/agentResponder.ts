import type { ChatUser, ChatMessage } from '../types/chat';

export const TALK_TO_HUMAN_CHANNEL_ID = 'chan_talk_to_a_human';
export const AGENT_HUMAN_ID = 'agent_human';

export function getAgentUser(): ChatUser {
  return {
    id: AGENT_HUMAN_ID,
    name: 'Human',
    avatar: '👤',
    role: 'agent',
    isBot: true,
  };
}

export function isAgentTriggered(text: string, channelId: string, peerUserId?: string): boolean {
  if (channelId === TALK_TO_HUMAN_CHANNEL_ID) return true;
  if (peerUserId === AGENT_HUMAN_ID || channelId.includes(AGENT_HUMAN_ID)) return true;
  const lower = (text || '').toLowerCase();
  return (
    lower.includes('@human') ||
    lower.includes('@agent') ||
    lower.includes('@supervisoragent') ||
    lower.startsWith('/human') ||
    lower.startsWith('/agent') ||
    lower.startsWith('/ask')
  );
}

export function generateAgentResponse(
  prompt: string,
  context?: { channelName?: string; userName?: string }
): string {
  const cleanPrompt = (prompt || '').replace(/@Human|@human|@agent|@SupervisorAgent|\/human|\/agent|\/ask/gi, '').trim();
  const lower = cleanPrompt.toLowerCase();
  const userGreeting = context?.userName ? `Hello **${context.userName}**! ` : 'Hello! ';

  if (!cleanPrompt || /^(hi|hello|hey|greetings|howdy|yo)\b/i.test(lower)) {
    return `👋 ${userGreeting}I'm **Human**, your built-in autonomous AI teammate. I'm here to collaborate with you on code, tasks, Git operations, and architectural decisions. What are we building or solving today?`;
  }

  if (lower.startsWith('/help') || lower.includes('what can you do') || lower.includes('help me')) {
    return `### 👤 Human Assistant Capabilities\n\n- 🔒 **E2EE & Git Sync**: Explaining zero-backend Git replication on \`refs/heads/git-chat\` and AES-GCM-256 vaults.\n- 💻 **Code & Architecture**: Answering questions across TypeScript, Node.js, Python, Git workflows, and testing.\n- 💬 **Always Open Channel**: I am always active in **#Talk to a Human** and via direct message.\n- 📎 **S3 & Media Attachments**: Assisting with binary asset encryption and cloud storage integration.\n\n*Feel free to ask any technical, architectural, or debugging question!*`;
  }

  if (lower.includes('e2ee') || lower.includes('encrypt') || lower.includes('vault') || lower.includes('aes')) {
    return `🔒 **Git-Chat Security & E2EE Model**:\n\n1. **AES-GCM-256 Encryption**: Every message is encrypted client-side using a key derived from your workspace passphrase via PBKDF2 with SHA-256.\n2. **Discrete Git Payloads**: The Git branch (\`refs/heads/git-chat\`) stores only encrypted ciphertexts, protecting your data in transit and at rest.\n3. **DataIsolationGuard**: Strict write sandboxing ensures localhost users cannot tamper with core codebase files (\`package.json\`, \`src/\`, etc.).`;
  }

  if (lower.includes('typescript') || lower.includes('code') || lower.includes('function') || lower.includes('javascript')) {
    return `Here is a clean implementation with strict typing:\n\n\`\`\`typescript\nexport function addNumbers(a: number, b: number): number {\n  return a + b;\n}\n\`\`\`\n\n*Key Highlights*:\n- Strict type safety with zero runtime overhead.\n- Follows single-responsibility design for modularity.`;
  }

  if (lower.includes('git') || lower.includes('branch') || lower.includes('commit') || lower.includes('push')) {
    return `💡 **Git Operations Guide**:\n\n- **Chat Isolation Branch**: \`refs/heads/git-chat\` is completely separate from your active code branch (\`master\` / \`main\`).\n- **Discrete Atomic Commits**: Each message or reaction is written as an isolated JSON file to eliminate merge conflicts.\n- **Sync Command**: Run \`npm run setup\` or click **Sync** to replicate changes peer-to-peer.`;
  }

  return `🤖 **Human Response**:\n\nI have received your request: *"${cleanPrompt.slice(0, 100)}"*.\n\nI'm actively monitoring this channel to assist with your development tasks, workspace collaboration, and system queries. Let me know if you would like me to draft code, review architecture, or run tests!`;
}

export function createAgentMessage(
  channelId: string,
  content: string,
  threadRootId?: string,
  encryptedPayload?: any
): ChatMessage {
  return {
    id: `msg_${Date.now()}_agent_${Math.random().toString(36).slice(2, 7)}`,
    channelId,
    threadRootId: threadRootId || undefined,
    author: getAgentUser(),
    content,
    encrypted: encryptedPayload || undefined,
    timestamp: Date.now(),
  };
}
