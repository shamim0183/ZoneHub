# 🚀 SkyCommerce Media Hub & Team Collaboration Server

> A lightweight, zero-dependency, self-hosted LAN media streaming and real-time team collaboration server built with native C# (`HttpListener` / `TcpListener`) and a modern Vanilla HTML5/CSS3/JavaScript web interface.

[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20iOS%20%7C%20Android-blue.svg)](https://github.com)
[![Runtime](https://img.shields.io/badge/.NET%20Framework-4.0%2B%20(Built--in)-green.svg)](https://github.com)
[![Dependencies](https://img.shields.io/badge/Dependencies-Zero%20(No%20Node%2C%20No%20Python)-brightgreen.svg)](https://github.com)

---

## ✨ Key Features

- **📂 Folder-Wise Organization:**
  - Dedicated categorization for `Videos/`, `Pictures/`, `Documents/`, `Chat_Media/`.
  - Dynamic folder creation directly from the web interface.
  - Interactive folder cards with live file counts and storage usage stats.
  - Breadcrumb navigation and upload folder selector.

- **🍎 Flawless Cross-Platform Streaming:**
  - Full **HTTP 206 Partial Content** byte-range streaming support (compatible with iOS Safari, macOS Safari/Chrome, Android, and Windows).
  - High-performance chunked file downloads with live speed meter (MB/s) and progress percentages.

- **💬 Real-Time Team Chat:**
  - Live polling team communication.
  - **Author-Restricted Edit & Delete:** Users can only edit or delete their own messages.
  - **Audit Tombstones:** Public notification when a message is deleted (*"🚫 এই মেসেজটি মুছে ফেলা হয়েছে"*).
  - **Voice Notes:** Record and send audio notes with custom waveform player.
  - **Emoji Reactions:** Quick reactions (`👍`, `❤️`, `😂`, `🔥`, `🎉`).
  - **Inline Images:** Instant picture sharing directly inside the chat stream.

- **🌐 Dynamic IP & Hostname Auto-Detection:**
  - Dynamic local IP detection via UDP socket routing table probe—automatically adapts whenever you change Wi-Fi networks or router DHCP leases.
  - Computer name hostname support (e.g., `http://DESKTOP-Q4J8832:8080`) for Mac & Windows.

- **⚡ Zero External Dependencies:**
  - Compiles using Windows' built-in .NET Framework compiler (`csc.exe`). No Node.js, Python, or NuGet packages needed.

- **🔄 Windows Boot Auto-Start (No Login Needed):**
  - Includes automated scripts to register a Windows Task Scheduler task under `NT AUTHORITY\SYSTEM` and configure Windows Firewall rules for port 8080 across all network profiles (Domain, Private, Public).

---

## 📁 Repository Structure

```
├── server.cs                    # Multi-threaded C# HTTP server source code
├── index.html                   # Single-page modern responsive web application
├── Build.bat                    # 1-click compilation script (uses Windows csc.exe)
├── Start-Share-Server.bat       # Start server in a console window
├── Stop-Share-Server.bat        # Stop any running server instance
├── Enable-AutoStart-NoLogin.bat # Configure boot autostart & firewall (Run as Admin)
├── Disable-AutoStart-NoLogin.bat# Remove boot autostart task
├── .gitignore                   # Ignore media files, binaries, and logs
├── Videos/                      # Video files (streaming supported)
├── Pictures/                    # Image files & previews
├── Documents/                   # PDF, DOCX, ZIP, and other documents
└── Chat_Media/                  # Audio voice notes & chat image attachments
```

---

## 🚀 Quick Start Guide

### 1. Build the Server
Run the included batch script to compile the server:
```cmd
Build.bat
```
*Or compile manually using Windows built-in .NET Framework compiler:*
```cmd
C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /target:exe /optimize+ /out:server.exe server.cs
```

### 2. Start the Server
Double-click `Start-Share-Server.bat` or run:
```cmd
server.exe
```
The server will output your local access links:
- **Localhost Link (Host PC):** `http://localhost:8080`
- **Wi-Fi / LAN Link (Mobile & Employees):** `http://<YOUR_LOCAL_IP>:8080`
- **Computer Name Link:** `http://<YOUR_PC_NAME>:8080`

### 3. (Optional) Run Automatically on PC Boot
To ensure the server starts automatically whenever the computer turns on (without requiring a Windows user login):
1. Right-click **`Enable-AutoStart-NoLogin.bat`**
2. Select **"Run as administrator"**

---

## 🌐 Running Under Different Networks

### Scenario A: Same Wi-Fi (Home / Office / Mobile Hotspot)
1. Connect all devices (mobile phones, laptops, desktops) to the **same Wi-Fi router / SSID**.
2. Start the server on the host PC.
3. The server automatically detects your current IP on the new router.
4. On any other phone or computer, open the URL displayed in the dashboard header:
   ```
   http://<NEW_LOCAL_IP>:8080
   ```
   *Tip: Ensure your Wi-Fi router does not have "AP Isolation" or "Guest Mode" enabled, as those prevent LAN devices from communicating.*

### Scenario B: Different Networks / Mobile Cellular Data / Outside the Office
If employees need access from outside the local Wi-Fi (e.g. from mobile 4G/5G data or remote homes):
- **Option 1 (Cloudflare Tunnel - Recommended):**
  Install [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) (`cloudflared`) to securely expose port 8080 to a permanent public HTTPS URL with zero router configuration.
  ```cmd
  cloudflared tunnel --url http://localhost:8080
  ```
- **Option 2 (Tailscale / ZeroTier):**
  Install Tailscale on the host PC and remote devices to create a secure, encrypted peer-to-peer mesh network.

---

## 🛡️ License

This project is licensed under the MIT License - feel free to use and customize for your team or organization!
