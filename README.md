# Teams LAN Desktop Workspace

A real-time, self-hosted, Microsoft Teams–style multi-desktop chat environment that works **entirely over your local Wi-Fi network**. No cloud, no external accounts, no installation pain — just open a browser on any desktop.

## Features

- **Channels**: `#general`, `#announcements`, `#dev-chat`, `#random` + create your own
- **Threaded Replies**: Side panel per-message threads (MS Teams style)
- **Direct Messages**: Private 1-on-1 chats between any two desktops
- **File & Image Sharing**: Drag & drop or file picker with inline previews
- **WhatsApp-style Voice Notes**: Record & send audio messages in-browser
- **WebRTC Video & Voice Calls**: "Meet Now" meetings with screen sharing
- **Real-time Presence**: Available 🟢 / Busy 🔴 / Away 🟡 / Offline ⚪
- **Emoji Reactions**: 👍 ❤️ 😂 🔥 on any message
- **Typing Indicators**: Live "Alice is typing..." alerts
- **User Login / Registration**: Secure password-protected accounts
- **Popup Notifications**: Rich in-app alerts for new messages & user logins
- **Multi-Desktop LAN**: Bind to all network interfaces, share one URL

## Requirements

- **Node.js** v18+ (already installed)
- Same Wi-Fi / LAN network on all desktops

## Quick Start

### Option 1: Double-click
Double-click **`start-chat.bat`** — server starts and browser opens automatically.

### Option 2: Terminal
```powershell
npm start
```

## Connect Other Desktops

On any other desktop on the same Wi-Fi, open a browser and visit:
```
http://192.168.25.72:3000
```
*(Replace `192.168.25.72` with your host machine's local IP — shown in the sidebar banner)*

## Architecture

| File | Purpose |
|------|---------|
| `server.js` | Pure Node.js HTTP + WebSocket server (no external dependencies) |
| `public/index.html` | MS Teams–style UI layout |
| `public/css/teams.css` | Fluent dark mode design system |
| `public/js/app.js` | Client state, WebSocket client, WebRTC call manager |
| `data/db.json` | Persistent JSON store (messages, users, channels) |
| `public/uploads/` | Uploaded files and voice notes |

## Stack

- **Backend**: Pure Node.js (built-in `http`, `crypto`, `fs`, `os` modules — zero npm packages required)
- **Real-time**: RFC 6455 WebSocket (hand-rolled, zero dependencies)
- **Auth**: scrypt password hashing + HMAC session tokens
- **Calls**: WebRTC peer-to-peer with STUN signaling relay
- **Persistence**: JSON flat-file database (`data/db.json`)
- **Frontend**: Vanilla HTML/CSS/JS — no frameworks, no build step
