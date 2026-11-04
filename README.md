# 🌐 ZoneHub - Connected Network Zone & Real-Time LAN Collaboration Platform

> **A high-performance, lightweight, zero-dependency self-hosted LAN & Internet media hub, peer-to-peer file transfer engine, and real-time team collaboration platform.** Built with pure native C# (`TcpListener`) and modern vanilla HTML5 / CSS3 / JavaScript.

[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20iOS%20%7C%20Android-blue.svg)](https://github.com/shamim0183/ZoneHub)
[![Mobile Responsive](https://img.shields.io/badge/Mobile-100%25%20Responsive%20(iOS%20%7C%20Android)-success.svg)](https://github.com/shamim0183/ZoneHub)
[![Runtime](https://img.shields.io/badge/.NET%20Framework-4.0%2B%20(Native%20Windows)-green.svg)](https://github.com/shamim0183/ZoneHub)
[![Dependencies](https://img.shields.io/badge/Dependencies-Zero%20(No%20Node%2C%20No%20Python)-brightgreen.svg)](https://github.com/shamim0183/ZoneHub)
[![WebRTC](https://img.shields.io/badge/WebRTC-P2P%20Direct%20Transfer-orange.svg)](https://github.com/shamim0183/ZoneHub)
[![Cloudflare Tunnel](https://img.shields.io/badge/Remote%20Access-Cloudflare%20Tunnel%20(HTTPS)-purple.svg)](https://github.com/shamim0183/ZoneHub)

---

## ⚡ 1-Click Express Setup

ZoneHub requires **zero third-party dependencies** — no Node.js, no Python, no npm, and no Docker. It runs natively on any Windows 7, 8, 10, or 11 machine using the built-in Microsoft .NET Framework.

1. **Clone or Download** this repository:
   ```cmd
   git clone https://github.com/shamim0183/ZoneHub.git
   ```
2. Double-click **`Setup-ZoneHub.bat`** (or run `server.exe` directly).
3. The automated Setup Wizard will:
   - Detect all available drives (`C:`, `D:`, `E:`) and automatically select the drive with the most free storage space (e.g., `D:\ZoneHub_Storage`).
   - Configure Windows Firewall rules automatically.
   - Set up silent Windows background startup (boots automatically when PC starts).
   - Create a desktop shortcut with the official embedded multi-resolution ZoneHub icon.
   - Launch ZoneHub instantly in your default web browser at `http://localhost:8080`.

---

## 🚀 Key Features

### 1. ⚡ AirDrop Beam — High-Speed WebRTC P2P Direct Transfer
* **0 Bytes Host Storage Used:** When beaming files directly between colleagues, ZoneHub streams data peer-to-peer over local Wi-Fi directly between the two devices' RAM via native WebRTC DataChannels.
* **16KB Chunking & Hardware Backpressure:** SCTP buffering with 1MB high-water marks and batched 8MB Blob allocation enables smooth, uninterrupted transfers of **1GB+ 4K videos and large ZIP archives** without freezing.
* **ICE Restart & Disconnect Resilience:** Automatic signaling recovery and connection health checks keep transfers reliable across varying Wi-Fi signal strengths.

### 2. 💬 Advanced Team Chat & 1-on-1 Private DMs
* **Public Team Chat & Channels:** Real-time office messaging with rich formatting, code snippets, interactive team polls, and emoji reactions.
* **1-Click 1-on-1 Private DMs:** Click any colleague in the **Connected Devices** list to instantly open an end-to-end private chat session.
* **Rich Media & Albums:** WhatsApp-style multi-image collages, voice notes with live waveforms, and inline video playback with full controls.
* **High-Speed Direct Media Downloads:** Streamlined 1-click download button on videos and photos with native `Content-Disposition` headers and zero RAM overhead.

### 3. 👤 Permanent Colleague & PC Identity
* **In-Page Name Customization:** Set your preferred display name via the dedicated **Set Your Name** modal (`✏️`).
* **Permanent Retention:** Custom names are saved to `localStorage` and registered with the server's device cache, ensuring your identity is permanently preserved across reboots and browser updates without reverting to hardware IDs.

### 4. 📁 Drag-and-Drop & Whole Folder Upload
* **Recursive Folder Upload:** Select or drag an entire folder structure — ZoneHub reconstructs the subdirectories automatically.
* **Deep Catchment Drag-and-Drop:** Intuitive dashed upload zone with full capture phase handling prevents accidental browser tab navigation.
* **In-Page Custom Folder Creation:** Create custom categorized folders with 1-click in-page modals, auto-routing uploads to custom destinations or auto-sorting by type (`Videos`, `Pictures`, `Documents`).

### 5. 💾 Live Drive Switching & Self-Healing Architecture
* **Live Drive Selection:** Select any drive or custom storage path (e.g. `D:\ZoneHub_Storage`) on the fly directly from the dashboard ribbon or Admin Security Modal.
* **Database & Chat History Safety:** All core databases (`messages.json`, `file_metadata.json`, `hub_config.json`, voice recordings) are safely anchored to the application home directory and synchronized, ensuring **zero chat loss** even when changing drives.
* **Self-Healing Storage:** If a configured storage directory is accidentally deleted or an external USB drive is unplugged, ZoneHub automatically recreates the missing folder structure (`Videos`, `Pictures`, `Documents`) or gracefully falls back without crashing.

### 6. 📱 100% Mobile Responsive & PWA Ready
* **iPhone & Android Optimized:** Clean, balanced interface tailored for mobile touchscreens with dedicated mobile views, compact action headers, and zero horizontal scrolling.
* **Progressive Web App (PWA):** Tap **📲 Install App** to install ZoneHub as a standalone native app on Android, iOS Safari (Add to Home Screen), or Windows/macOS.
* **Instant QR Code Connection:** Tap **📷 QR Code** to show a high-resolution offline vector QR code — scan with any smartphone camera to connect immediately without typing IP addresses.

### 7. 🌐 Go Global Remote Access (Cloudflare Tunnel)
* **Worldwide HTTPS Access:** Click **Go Global** to activate an end-to-end encrypted Cloudflare Tunnel.
* **No Port Forwarding & No VPN:** Access your home or office hub from anywhere in the world through a secure `https://*.trycloudflare.com` link.
* **1-Click Share & QR:** Copy the global link or open its instant QR code to share with remote team members.

### 8. 🔒 Admin Security & PIN Management
* **Automatic Localhost Admin:** The Host PC is always recognized automatically as Admin with zero login prompts.
* **Current PIN Display:** The Host screen displays the current Admin PIN directly inside the security modal.
* **PIN Reset Utility:** If the PIN is forgotten, run `tools\Reset-Admin-PIN.bat` to reset it back to default (`1234`) with one click.
* **Sticky Modal Header:** The Admin Security Control dialog features a pinned sticky header on mobile with accessible close buttons at both top and bottom.

---

## 🛠️ System Architecture

```
                          ┌─────────────────────────────┐
                          │   ZoneHub Host Server       │
                          │   (C# / .NET 4.x TcpServer) │
                          │   Port 8080 (Zero Deps)     │
                          └──────────────┬──────────────┘
                                         │
                 ┌───────────────────────┼───────────────────────┐
                 │ Local LAN HTTP        │ WebRTC Signaling      │ Cloudflare Tunnel
                 ▼                       ▼                       ▼
      ┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐
      │ Desktop Browsers    │ │ AirDrop P2P Engine  │ │ Remote Users        │
      │ (Chrome, Edge, Mac) │ │ (RAM-to-RAM direct) │ │ (Encrypted HTTPS)   │
      └─────────────────────┘ └─────────────────────┘ └─────────────────────┘
```

### Core Technologies
- **Backend:** Native C# 5.0 (`server.cs`), compiled directly via `.NET Framework 4.x` `csc.exe` (zero runtimes to install).
- **Frontend:** Vanilla HTML5, CSS3, ES6+ JavaScript (zero build step, zero npm, zero external dependencies).
- **Real-Time Layer:** SSE / Polling fallback + native WebRTC DataChannels with ICE candidate exchange.
- **Storage Layer:** Raw streaming disk I/O with partial HTTP Range requests (206) for video seeking on Apple Safari and Chrome.

---

## 💻 Building from Source

To recompile `server.exe` on any Windows computer:
```cmd
C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /target:exe /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll /out:server.exe server.cs
```

To run the server:
```cmd
server.exe
```

---

## 📋 API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/` | `GET` | Main Web UI dashboard & team chat interface |
| `/api/messages` | `GET`, `POST` | Retrieve and post chat messages, reactions, & polls |
| `/api/folders` | `GET` | List storage folders with file counts and sizes |
| `/api/folders/create?name=...` | `POST` | Create a new custom categorized folder |
| `/api/files` | `GET` | List indexed files with metadata, timestamps, and sizes |
| `/upload` | `POST` | Raw streaming file upload with progress tracking |
| `/api/register-device?name=...` | `POST` | Permanently register client display name for LAN |
| `/api/p2p/signal` | `POST` | WebRTC AirDrop signaling for direct P2P transfer |
| `/api/stats` | `GET` | Host storage, CPU, RAM, and live network metrics |
| `/api/download-zip` | `GET`, `POST` | Dynamic on-the-fly multi-file ZIP generation |

---

## 📄 License

This project is licensed under the MIT License — free for personal and commercial team use.
Developed with ❤️ by **Md Shamim Hossain**.
