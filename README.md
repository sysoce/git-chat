# git-chat

Zero-backend, single-file, end-to-end encrypted chat. Live transports (P2P, Mesh, SSE) deliver messages. Hosted Git repos are the worst-case backup.

**Live demo:** [https://sysoce.github.io/git-chat/](https://sysoce.github.io/git-chat/)

---

## Tokenless vs authenticated — what that means

GitHub rate-limits API calls differently depending on whether the browser sends a **Personal Access Token (PAT)**.

| Mode | What you do | GitHub API quota | Can write to private `chat-data`? |
|------|-------------|------------------|----------------------------------|
| **Tokenless** | Leave the PAT field empty | ~60 requests / hour | No (read-only on public repos only) |
| **Authenticated** | Paste a PAT in Settings | ~5 000 requests / hour | Yes |

Realtime modes (**Mesh Live**, **P2P**, **Live SSE**) do not need a PAT. The PAT is only for the GitHub Sync and Gist Vault tiers that persist messages into a git repo.

For multi-device chat that survives closing the browser, use an authenticated client (shared PAT, or each person with their own).

---

## Minimal setup (multi-device, 2 minutes)

### Option A — Open the hosted app (no install)

1. On the first device open **https://sysoce.github.io/git-chat/** and unlock it.
2. Click **Mobile**, then scan or copy its pairing link to every other device.
3. Pick a different display name on each device.
4. Send a message. The pairing link carries the exact repository and encryption secret, so every linked client derives the same key.
5. (Recommended) Settings → Workspace → paste a GitHub PAT with `repo` scope so messages persist after every device closes.

Do not construct the second device manually when a pairing link is available. Devices must share the same **owner/repo + workspace secret**. The setup hash is removed from the address bar immediately after use because it may contain the secret or PAT.

### Option B — Local + QR pair (phone ↔ computer)

```bash
npm install
npm run setup    # prints QR + GitHub Pages pairing URL
npm start        # http://localhost:4300
```

Scan the QR from your phone, or open the printed Pages URL. The `#setup=…` hash injects repo, token, vault password, and bridge URL automatically.

### Option C — Download the single file

1. Open [download.html](https://sysoce.github.io/git-chat/download.html) or run `npm start` and visit `/download.html`
2. Save `git-chat.html` and open it from `file://` on any device
3. Same vault password + repo as above

---

## Connection modes (automatic failover)

| Priority | Mode | Needs |
|----------|------|--------|
| 1 | P2P Direct (WebRTC) | STUN reachability |
| 2 | Mesh Live (public MQTT) | Network |
| 3 | Live SSE | `npm start` with a matching local workspace |
| 4 | GitHub Sync (backup) | Repo + PAT, used when live modes are down |
| 5 | Gist Vault (backup) | Gist ID + token with `gist` scope |

Offline writes queue locally and drain on reconnect.

The local SSE bridge is accepted only when its git repository matches the selected workspace. This prevents a local checkout of the `git-chat` application from injecting its historical `git-chat` branch into a separate `chat-data` workspace.

**Optional Gist backup:** Settings → Workspace → Gist Vault ID. Every encrypted update is mirrored there as a rolling off-site backup.

The green connection badge is a button. Click it to cycle **Automatic → P2P → Mesh → SSE → Git → Gist**. Selecting an unavailable mode still permits automatic fallback. **Refresh** manually asks every live peer and configured storage backend for current messages; background delivery remains enabled.

---

## Clean slate

Settings → **Clean Slate** replaces the tip of the **configured data repository** (`sysoce/chat-data` by default) with only `workspace.json` + `#general`, then bumps `historyEpoch`. Stale offline queues, Gist vault copies, and old mesh catch-up files are rejected after the bump. A GitHub PAT is required. `npm run reset` only resets the local `git-chat` branch used by the development bridge.

---

## Channel management

- Create channels with the **+** beside Channels.
- Channel creators and workspace admins see a **•••** action beside manageable channels and in the channel header.
- Rename a channel or update its topic without moving its existing message history.
- Archive a channel to remove it from active lists on every synced client. Its encrypted history remains retained; `#general` cannot be archived.

---

## Key or old-history problems

- **`Decryption failed` on only one device:** generate a fresh pairing link from a client that can read current messages, then open that link on the failing device.
- **Old development messages:** version 1.0.10+ migrates the legacy `sysoce/git-chat` app-repo default to `sysoce/chat-data`. Its local encrypted messages are retained under the browser backup key `git_chat_legacy_messages_backup`, but are not mixed into the new workspace.
- **Changing repositories:** Settings clears the visible cache before loading the selected repository, preventing histories from two workspaces from being combined.
- **Search:** unlock the vault first; search covers decrypted body text, author names, and `#channel` names.

---

## Quick commands

```bash
npm start      # local bridge at :4300
npm run setup  # QR + pairing URL
npm run tunnel # public SSH tunnel for mobile
npm test       # suite
npm run lint   # typecheck
```

After editing `index.html`, keep the Pages alias in sync:

```bash
cp index.html git-chat.html
```

---

## Security model

- Messages are AES-GCM-256 sealed before any transport; the git repo stores ciphertext.
- Chat data lives on an isolated ref / data repo — never on application `master` source files.
- `DataIsolationGuard` blocks path traversal and writes outside the chat file whitelist.

---

## License

Apache-2.0 © 2026 sysoce
