# `git-chat` 💬

> A zero-backend, single-file chat channel with isolated Git data synchronization and autonomous AI agent teammates.

---

## ⚡ Highlights

- **Single-File Web App (`index.html`)**: Open `index.html` directly in any web browser (`file://`) or serve it locally. Zero servers or databases required.
- **Git-Powered Serverless Database**: Channels, threads, reactions, direct messages, and autonomous agent logs are stored as discrete, conflict-free JSON files on a dedicated `refs/heads/git-chat` data ref.
- **Strict User Data Isolation on Localhost**:
  - `master` branch is strictly protected. User chat actions only commit to `refs/heads/git-chat`.
  - Built-in `DataIsolationGuard` sandboxes all write paths, blocking attempts to touch codebase files (`package.json`, `index.html`, `src/`, etc.) or use path traversal (`../`).
  - Author identity confinement: Users can only write/push to author-prefixed message files matching their active user ID.
- **Autonomous AI Agents as First-Class Teammates**: AI agents (`@SupervisorAgent`) participate directly in channel timelines and reply to threads.
- **Instant Setup Wizard & Terminal QR**: Modeled after the `monitor` app—one command (`npm run setup`) detects your GitHub configuration and prints a mobile pairing QR code.

---

## 🚀 Quick Start

### 1. One-Command Setup Wizard
```bash
npm run setup
```
This wizard will:
1. Detect your Git remote (`origin` -> `sysoce/git-chat`) and GitHub credentials (`gh auth token` or `GITHUB_TOKEN`).
2. Initialize the isolated data branch (`refs/heads/git-chat`) with default channels (`#general`, `#engineering`, `#agents`, `#random`).
3. Generate a quick setup URL (`#setup=...`) and print a terminal QR code for instant mobile/browser connection.

### 2. Start the Local App
```bash
npm start
```
Starts the local server at `http://localhost:4300`.

Or simply double-click **`index.html`** to run purely in your web browser!

---

## 🔒 Security & Sandboxing Model

When running on `localhost` or in browser:
1. **Branch Protection**: Chat actions are mathematically restricted to `refs/heads/git-chat`.
2. **Path Whitelist**:
   - `channels/<channel_id>/messages/<timestamp>_<authorId>_<uuid>.json`
   - `channels/<channel_id>/threads/<root_id>/<timestamp>_<authorId>_<uuid>.json`
   - `channels/<channel_id>/events/<timestamp>_<authorId>_<type>_<uuid>.json`
   - `users/<user_id>.json`
   - `presence/<user_id>.json`
   - `workspace.json`
   - `chat-manifest.json`
3. **Strict Deny**:
   - Blocks any write to `package.json`, `tsconfig.json`, `index.html`, `src/`, `.git/`, `.env`, or hidden dotfiles.
   - Blocks path traversal (`../`).
   - Blocks author identity spoofing.

---

## 🧪 Testing

Run the test suite:
```bash
npm test
```

---

## 📄 License
Apache-2.0 © 2026 sysoce
