# git-chat

Zero-backend, single-file, end-to-end encrypted chat. Hosted Git repos are the database, the transport, and the backup.

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

1. On each device open: **https://sysoce.github.io/git-chat/**
2. Unlock the vault with password: **`git-chat-open`**
3. Pick a display name. Default workspace is already `sysoce/chat-data` with secret `git-chat-open`.
4. (Recommended) Settings → Workspace → paste a GitHub PAT with `repo` scope so messages persist.
5. Send a message. Other devices on the same workspace decrypt it over Mesh Live immediately; GitHub Sync catches up as backup.

Devices that share the same **owner/repo + vault password / workspace secret** are in the same chat.

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
| 3 | Live SSE | `npm start` on LAN |
| 4 | GitHub Sync | Repo + optional PAT |
| 5 | Gist Vault | Gist ID + token with `gist` scope |

Offline writes queue locally and drain on reconnect.

**Optional Gist backup:** Settings → Workspace → Gist Vault ID. Every encrypted update is mirrored there as a rolling off-site backup.

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
