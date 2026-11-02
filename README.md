# 🌐 ZoneHub - Connected Network Zone & Real-Time Collaboration Platform

> **A high-performance, lightweight, zero-dependency self-hosted LAN & Internet media hub, peer-to-peer file transfer engine, and real-time team collaboration platform.** Built with pure native C# (`TcpListener`) and modern vanilla HTML5 / CSS3 / JavaScript.

[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20iOS%20%7C%20Android-blue.svg)](https://github.com/shamim0183/ZoneHub)
[![Mobile Responsive](https://img.shields.io/badge/Mobile-100%25%20Responsive%20(iOS%20%7C%20Android)-success.svg)](https://github.com/shamim0183/ZoneHub)
[![Runtime](https://img.shields.io/badge/.NET%20Framework-4.0%2B%20(Native%20Windows)-green.svg)](https://github.com/shamim0183/ZoneHub)
[![Dependencies](https://img.shields.io/badge/Dependencies-Zero%20(No%20Node%2C%20No%20Python)-brightgreen.svg)](https://github.com/shamim0183/ZoneHub)
[![WebRTC](https://img.shields.io/badge/WebRTC-P2P%20Direct%20Transfer-orange.svg)](https://github.com/shamim0183/ZoneHub)
[![Cloudflare Tunnel](https://img.shields.io/badge/Remote%20Access-Cloudflare%20Tunnel%20(HTTPS)-purple.svg)](https://github.com/shamim0183/ZoneHub)

---

## 🚀 1-Click Express Setup (এক ক্লিকে ইনস্টলেশন)

ZoneHub requires **zero third-party dependencies** — no Node.js, no Python, no npm, and no Docker. It runs natively on any Windows 7, 8, 10, or 11 machine using the built-in Microsoft .NET Framework.

1. **Clone or Download** this repository to your PC:
   ```cmd
   git clone https://github.com/shamim0183/ZoneHub.git
   ```
2. Double-click **`Setup-ZoneHub.bat`**.
3. The automated Setup Wizard will:
   - Detect all available hard drives (`C:`, `D:`, `E:`) and automatically select the drive with the most free storage space (e.g., `D:\ZoneHub_Storage`).
   - Configure Windows Firewall permissions automatically.
   - Set up silent Windows background startup (boots automatically when your PC turns on).
   - Create a desktop shortcut with the official embedded multi-resolution ZoneHub icon.
   - Launch ZoneHub instantly in your default web browser at `http://localhost:8080`.

---

## ✨ Key Features (প্রধান সুবিধাসমূহ)

### 1. ⚡ WebRTC Peer-to-Peer Direct Transfer (জিরো-ডুপ্লিকেশন ফাইল শেয়ার)
* **0 Bytes Host Storage Used:** When sending files or complete folders directly to an active colleague in **Direct Messages**, ZoneHub streams data peer-to-peer over local Wi-Fi directly between the two devices' RAM via native WebRTC DataChannels.
* **No Server File Duplication:** Local transfers do not create duplicate `_1`, `_2` files on the host computer or consume drive space.

### 2. 💾 Live Drive Switching & Self-Healing Architecture
* **Live Drive Selection:** Select any drive or custom storage path (e.g. `D:\ZoneHub_Storage`) on the fly directly from the dashboard ribbon (`Change ▾`) or Admin Security Modal.
* **Database & Chat History Safety:** All core databases (`messages.json`, `file_metadata.json`, `hub_config.json`, voice recordings) are safely anchored to the application home directory and synchronized, ensuring **zero chat loss** even when changing drives.
* **Self-Healing Storage:** If a configured storage directory is accidentally deleted or an external USB drive is unplugged, ZoneHub automatically recreates the missing folder structure (`Videos`, `Pictures`, `Documents`) or gracefully falls back without crashing.

### 3. 📱 100% Mobile Responsive & PWA Ready
* **iPhone & Android Optimized:** Clean, balanced interface tailored for mobile touchscreens with dedicated mobile views, compact action headers, and zero horizontal scrolling.
* **Progressive Web App (PWA):** Tap **📲 Install App** to install ZoneHub as a standalone native app on Android, iOS Safari (Add to Home Screen), or Windows/macOS.
* **Instant QR Code Connection:** Tap **📱 QR Code** to show a high-resolution offline vector QR code — scan with any smartphone camera to connect immediately without typing IP addresses.

### 4. 🌐 Go Global Remote Access (Cloudflare Tunnel)
* **Worldwide HTTPS Access:** Click **Go Global** to activate an end-to-end encrypted Cloudflare Tunnel.
* **No Port Forwarding & No VPN:** Access your home or office hub from anywhere in the world through a secure `https://*.trycloudflare.com` link.
* **1-Click Share & QR:** Copy the global link or open its instant QR code to share with remote team members.

### 5. 👑 Admin Security & Forgot PIN Protection
* **Automatic Localhost Admin:** The Host PC is always recognized automatically as Admin (`req.IsLocalhost`) with zero login prompts.
* **Current PIN Display:** The Host screen displays the current Admin PIN directly inside the security modal.
* **PIN Reset Utility:** If the PIN is forgotten, run `tools\Reset-Admin-PIN.bat` to reset it back to default (`1234`) with one click.
* **Sticky Modal Header:** The Admin Security Control dialog features a pinned sticky header on mobile with accessible `✕` close buttons at both top and bottom.

### 6. 💬 Advanced Team Chat & 1-on-1 Private DMs
* **Public Team Chat & Channels:** Real-time office messaging with rich markdown, link previews, code snippets, and reactions.
* **Private Direct Messaging:** Confidential 1-on-1 private messaging with unread badges and persistent history.
* **Voice Notes with Waveform & Speed Control:** Record voice instructions with live microphone visualizer and toggle **1x / 1.5x / 2x** playback speeds.
* **In-Chat Live Search:** Instant keyword filter with highlighted match markers and real-time match counters.
* **Pinned Announcements:** Anchor important notices to the top of the chat stream with 1-click smooth-scroll navigation.
* **WhatsApp-Style Media Albums:** Multiple photos and videos automatically format into collapsible collage grids with 1-click **Download All as ZIP**.

### 7. 🚀 LAN Speed Monitor & Connected Devices
* **Live Speed Meter:** Real-time bidirectional traffic sampling displaying download/upload speeds (`↓ KB/s • ↑ KB/s`) and total session bandwidth.
* **Active Devices Popover:** Click **Details ▾** to inspect all connected colleagues, device types (Windows PC, Mac, iPhone, Android), IP addresses, and active timestamps with instant modal dismiss.

### 8. 📌 Always-on-Top Mini Dock & Desktop Bubble
* **Mini Dock:** Pop out a detached Picture-in-Picture window that stays visible while editing in Premiere Pro, Photoshop, or DaVinci Resolve.
* **Desktop Bubble:** Lightweight floating desktop tray assistant (`ZoneHubBubble.exe`) embedded with multi-resolution 256x256 vector icons.

---

## 📂 Repository File Structure (প্রজেক্ট কাঠামো)

```
ZoneHub/
├── Setup-ZoneHub.bat              # 1-Click Master Express Installer & Setup
├── Uninstall-ZoneHub.bat          # 1-Click Clean Uninstaller
├── ZoneHubBubble.ico              # Multi-resolution embedded application icon
├── server.cs                      # Core C# multi-threaded HTTP/WebRTC server
├── index.html                     # Single-page modern responsive web app
├── css/
│   └── style.css                  # Dark-mode responsive styling & animations
├── js/
│   ├── app.js                     # Core application state, view routing, modals
│   ├── chat.js                    # Team chat, private DMs, voice notes, media
│   ├── dashboard.js               # Real-time metrics, speed, devices, cloudflare
│   ├── media.js                   # Files & media library, categories, folders
│   ├── p2p.js                     # WebRTC P2P direct transfer engine
│   ├── qrcode.js                  # Pure client vector QR code generator
│   ├── screenshare.js             # WebRTC live screen sharing
│   └── i18n.js                    # Multi-language internationalization
├── scripts/
│   ├── setup_wizard.ps1           # Automated drive detection & install engine
│   └── generate_ico.ps1           # Multi-resolution ICO frame generator
├── tools/                         # IT & Advanced Maintenance Utilities
│   ├── Build.bat                  # Compile server.exe from source with icon
│   ├── Restart-Server.bat         # 1-Click server restart & cache clear
│   ├── Reset-Admin-PIN.bat        # Reset Admin PIN to default (1234)
│   ├── Start-Online-Tunnel.bat    # Launch Cloudflare HTTPS worldwide tunnel
│   ├── Start-Desktop-Bubble.bat   # Launch floating desktop bubble app
│   ├── Connect-ZoneHub-Client.bat # Client connection diagnostic tool
│   ├── Enable-AutoStart-NoLogin.bat # Boot startup without Windows user login
│   ├── Disable-AutoStart-NoLogin.bat# Remove boot startup task
│   ├── Install-AutoStart.bat      # User startup folder configuration
│   ├── Uninstall-AutoStart.bat    # Remove startup shortcut
│   ├── Make-IP-Permanent.bat      # Static LAN IP configuration helper
│   ├── Revert-To-Automatic-IP.bat # Revert LAN adapter to DHCP
│   ├── Set-Custom-Online-Url.bat  # Bind custom domain/tunnel URL
│   ├── Setup-Storage-Drive.bat    # Drive partition selector utility
│   └── README.txt                 # Guide for IT administrators
├── Videos/                        # Video category library (.gitkeep)
├── Pictures/                      # Image category library (.gitkeep)
├── Documents/                     # Documents category library (.gitkeep)
└── .gitignore                     # Repository ignore rules
```

---

## 🛠️ IT & Power User Tools (`tools/` ডিরেক্টরি)

All advanced maintenance scripts have been organized cleanly into `tools/`:

| Utility Script | Purpose & Functionality |
|---|---|
| **`tools\Restart-Server.bat`** | Terminate running instances, recompile updates, and start fresh. |
| **`tools\Reset-Admin-PIN.bat`** | Instantly resets Admin PIN to `1234` on the Host machine. |
| **`tools\Start-Online-Tunnel.bat`** | Manually initiates Cloudflare Tunnel and displays worldwide link. |
| **`tools\Make-IP-Permanent.bat`** | Locks your Wi-Fi/Ethernet IP address to prevent IP changes across router reboots. |
| **`tools\Build.bat`** | Compiles `server.cs` into `server.exe` with embedded icon using native `csc.exe`. |

---

## 🔧 Compiling from Source (সোর্স কোড থেকে বিল্ড)

No build tools, SDKs, or package managers are required. Compile directly using the built-in Microsoft .NET Framework compiler included with Windows:

```cmd
tools\Build.bat
```

*Or run the manual compiler command directly:*
```cmd
C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /target:exe /optimize+ /win32icon:ZoneHubBubble.ico /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll /out:server.exe server.cs
```

---

## 📱 Connecting Devices (ডিভাইস সংযোগের নিয়ম)

* **Host Machine:** Open `http://localhost:8080` in your browser.
* **Mobile Phones (iOS & Android):** Click **📱 QR Code** on the host screen and scan it with your phone's camera.
* **Office Colleague PCs (Same Wi-Fi):** Open `http://<HOST_IP>:8080` (e.g. `http://192.168.0.108:8080`) or use computer name: `http://<PC_NAME>:8080`.
* **Remote Employees (Anywhere in the World):** Click **Go Global** to get your encrypted HTTPS link (`https://*.trycloudflare.com`).

---

## 🛡️ License & Community

Created with pride for the **ZoneHub Community**. Built purely with vanilla technologies for maximum performance, bulletproof security, and zero bloat. Free to use, customize, and share for home and office networks!
