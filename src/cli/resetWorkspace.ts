import { detectGitConfig, createChatCommit, pushChatBranch } from "../backend/chatGitPlumbing.js";
import { generateQrMatrix } from "../qr/qrEncoder.js";
import { renderQrToTerminal } from "../qr/qrRenderer.js";
import type { SetupResult } from "./setupWizard.js";
import type { ChatWorkspaceConfig } from "../types/chat.js";

export async function resetWorkspace(workspaceRoot: string, port = 4300): Promise<SetupResult> {
  const gitConfig = await detectGitConfig(workspaceRoot);
  const remoteUrl = gitConfig.remoteUrl || "git@github.com:sysoce/git-chat.git";
  const owner = gitConfig.info?.owner || "sysoce";
  const repo = gitConfig.info?.repo || "git-chat";
  const branch = "git-chat";

  const workspaceConfig: ChatWorkspaceConfig = {
    name: "Git-Chat Workspace",
    description: "Serverless Slack powered by Git data sync",
    defaultChannelId: "chan_general",
    createdAt: Date.now(),
    version: "1.0.0",
    channels: [
      { id: "chan_general", name: "general", topic: "Company-wide announcements and work-based matters", isPrivate: false },
    ],
  };

  const stagedFiles = [
    { relativePath: "workspace.json", content: JSON.stringify(workspaceConfig, null, 2) },
    ...workspaceConfig.channels.map(c => ({ relativePath: "channels/" + c.id + "/meta.json", content: JSON.stringify(c, null, 2) })),
  ];

  await createChatCommit({
    workspaceRoot,
    activeUserId: "user_admin",
    branch,
    files: stagedFiles,
    message: "chore: clean slate reset - pristine channels and zero message history",
    isWorkspaceInit: true,
    cleanSlate: true,
  });

  try {
    await pushChatBranch(workspaceRoot, branch, "origin", true);
  } catch {}

  const os = await import("node:os");
  const ifaces = os.networkInterfaces();
  let lanUrl = "http://localhost:" + port;
  for (const name in ifaces) {
    for (const net of ifaces[name] || []) {
      if (net.family === "IPv4" && !net.internal) {
        lanUrl = "http://" + net.address + ":" + port;
        break;
      }
    }
  }

  const setupPayload = {
    owner,
    repo,
    branch,
    remoteUrl,
    backendUrl: lanUrl,
  };

  const encodedPayload = Buffer.from(JSON.stringify(setupPayload)).toString("base64");
  const githubPagesUrl = `https://${owner}.github.io/git-chat/#setup=${encodedPayload}`;
  const mobileUrl = `${lanUrl}/#setup=${encodedPayload}`;
  const setupUrl = githubPagesUrl;
  const qrMatrix = generateQrMatrix(setupUrl);
  const qrTerminal = renderQrToTerminal(qrMatrix);

  return { remoteUrl, owner, repo, branch, setupUrl, githubPagesUrl, mobileUrl, qrTerminal };
}
