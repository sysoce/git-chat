import { describe, test } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import * as os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resetWorkspace } from "../src/cli/resetWorkspace.js";
import { readChatBranchFiles, createChatCommit } from "../src/backend/chatGitPlumbing.js";

const execFileAsync = promisify(execFile);

describe("Workspace Clean Slate & Reset Suite", () => {
  test("resetWorkspace produces a clean tree with default channels and zero messages", async () => {
    const tempDir = path.join(os.tmpdir(), "git-chat-reset-test-" + Date.now());
    await execFileAsync("git", ["init", tempDir]);
    await execFileAsync("git", ["config", "user.name", "Test Admin"], { cwd: tempDir });
    await execFileAsync("git", ["config", "user.email", "admin@example.com"], { cwd: tempDir });

    // 1. Add some dummy old messages
    await createChatCommit({
      workspaceRoot: tempDir,
      activeUserId: "user_test",
      branch: "git-chat",
      files: [
        { relativePath: "channels/chan_general/meta.json", content: "{}" },
        { relativePath: "channels/chan_general/messages/1700000000000_user_test_msg1.json", content: JSON.stringify({ id: "msg1", content: "old message" }) },
      ],
      message: "feat: add old message",
      isWorkspaceInit: true,
    });

    const beforeFiles = await readChatBranchFiles(tempDir, "git-chat");
    assert.ok(beforeFiles.some(f => f.relativePath.includes("msg1.json")));

    // 2. Perform clean slate reset
    const result = await resetWorkspace(tempDir, 4300);
    assert.ok(result.setupUrl.includes("#setup="));

    const afterFiles = await readChatBranchFiles(tempDir, "git-chat");
    const messageFiles = afterFiles.filter(f => f.relativePath.includes("/messages/"));
    assert.strictEqual(messageFiles.length, 0, "All old messages must be purged on clean slate");

    const channelMeta = afterFiles.filter(f => f.relativePath.endsWith("/meta.json"));
    assert.strictEqual(channelMeta.length, 4, "Must contain the 4 standard default channels");
  });
});
