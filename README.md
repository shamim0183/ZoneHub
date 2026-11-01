# 🌐 ZoneHub - Connected Network Zone & Team Collaboration Platform

> A lightweight, high-performance, zero-dependency self-hosted LAN & Internet media streaming, peer-to-peer file transfer, and real-time team collaboration platform built with native C# (`TcpListener`) and a modern Vanilla HTML5/CSS3/JavaScript responsive web interface.

[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20iOS%20%7C%20Android-blue.svg)](https://github.com/shamim0183/ZoneHub)
[![Mobile Responsive](https://img.shields.io/badge/Mobile-100%25%20Responsive%20(Samsung%20%7C%20iPhone%20%7C%20Android)-success.svg)](https://github.com/shamim0183/ZoneHub)
[![Runtime](https://img.shields.io/badge/.NET%20Framework-4.0%2B%20(Built--in)-green.svg)](https://github.com/shamim0183/ZoneHub)
[![Dependencies](https://img.shields.io/badge/Dependencies-Zero%20(No%20Node%2C%20No%20Python)-brightgreen.svg)](https://github.com/shamim0183/ZoneHub)
[![WebRTC](https://img.shields.io/badge/WebRTC-P2P%20Direct%20Transfer-orange.svg)](https://github.com/shamim0183/ZoneHub)

---

## ✨ Complete Feature Overview (সকল ফিচার ও সুবিধার তালিকা)

### 1. ⚡ WebRTC P2P Direct Drop & Zero-Duplication Storage (হোস্ট পিসির মেমরি খরচ ছাড়া শেয়ার)
* **0 Bytes Host Storage Used:** When sending files or folders in **Direct Messages** to an online colleague, ZoneHub uses native **WebRTC DataChannels** to stream files directly from your computer's RAM over local Wi-Fi straight into the recipient's Downloads folder.
* **No Server File Duplication:** Uploads and chat attachments do NOT create duplicate `_1`, `_2` files on the host PC or pollute the shared library.
* **D:\ Drive & External Hard Drive Sharing:**
  To share an existing folder from your `D:\` drive or external USB in the **Files & Media** library without copying gigabytes to `C:\`, create a Windows Directory Junction:
  ```cmd
  mklink /J "C:\Users\obak3\Videos\Screen Recordings\D_Drive_Files" "D:\YourFolderName"
  ```
  ZoneHub will index and stream the files directly from `D:\` with **0 MB duplicate storage used on C:**.

---

### 2. 📱 1-Click Mobile QR Code Quick Connect (মোবাইলে ১-ক্লিকে কানেকশন)
* **Instant Phone Access:** Click the **📱 QR Code** button in the network bar to display a high-resolution, standard vector SVG QR code (featuring Reed-Solomon Error Correction Level M).
* **Scan & Open:** Point any iPhone or Android camera at your screen — it instantly opens ZoneHub on Wi-Fi without needing to type the IP address (`http://192.168.0.xxx:8080`).
* **100% Offline:** The QR generator runs purely in native client JavaScript (`js/qrcode.js`) with zero internet or cloud dependencies.

---

### 3. 🔍 In-Chat Real-Time Search (চ্যাটে যেকোনো মেসেজ খোঁজার সুবিধা)
* **Team Chat & Private DM Search:** Click the **🔍 Search** button in the chat header (or press the search toggle) to open the live search bar.
* **Live Keyword Highlighting:** Type any keyword, link, filename, or employee name — matching messages are filtered in real-time with highlighted text markers.
* **Instant Match Counter:** Displays the exact count of matches (`X found`) with a 1-click **✕** clear button to instantly reset your view.

---

### 4. 🔒 Private 1-on-1 Direct Messages (ব্যক্তিগত চ্যাট ও স্থায়ী হিস্ট্রি)
* **Confidential Messaging:** Click **💬 Direct Message** to open a private conversation with any connected colleague. Only you and the recipient can see these messages and files.
* **Permanent Chat History:** Direct messages are stored persistently by username in `messages.json` so your chat history is retained across browser refreshes, server restarts, and different PC sessions.
* **Online Presence Status:** Real-time emerald green pulsing dot (`🟢 Online`) shows who is currently connected and active on the network.

---

### 5. 📌 Pinned Announcements & Notices (গুরুত্বপূর্ণ নোটিশ পিন করা)
* **Anchor Critical Notices:** Hover over any team message or shared link and click **📌 Pin**.
* **Sticky Announcement Banner:** The pinned notice stays anchored at the top of the chat stream for all employees to see.
* **1-Click Jump & Pulse:** Clicking the pinned banner smooth-scrolls straight to the original message with an attention-grabbing glow animation.

---

### 6. 🎤 Voice Notes with Waveform Visualizer & Playback Speed
* **Interactive Waveform Player:** Record and listen to voice notes with visual sound-wave bars.
* **1x / 1.5x / 2x Speed Controls:** Click the speed pill on any voice note to toggle between **1x**, **1.5x**, and **2x** playback speeds to listen to instructions faster.
* **Live Microphone Level Meter:** Visualizes input volume in real-time while recording to confirm microphone audio.

---

### 7. 📸 WhatsApp-Style Photo Albums & Multi-Select ZIP
* **Collage Grid Display:** Sending multiple photos or videos automatically formats them into an attractive 2-photo, 3-photo, or 4+ photo collage grid.
* **1-Click ZIP Download:** Download all media in an album with a single click as a compressed `.zip` archive.
* **Interactive Fullscreen Lightbox:** Click any photo or video to view it in full resolution with Next/Previous arrow navigation.

---

### 8. 📁 Drag & Drop Folder & File Sharing (ড্র্যাগ অ্যান্ড ড্রপ ফাইল শেয়ার)
* **Single-Click Attachments:** Separate **📎 File** and **📁 Entire Folder** buttons with zero annoying sub-menus or broken popups.
* **Universal Drag & Drop:** Drag files or complete nested folders from Windows Explorer and drop them directly onto the chat or upload area.

---

### 9. 🍎 Flawless Cross-Platform Video Streaming (HTTP 206 Byte-Range)
* Full **HTTP 206 Partial Content** byte-range streaming support (compatible with iOS Safari, macOS Safari/Chrome, Android, and Windows).
* Seamless scrub, fast-forward, and rewind on multi-gigabyte 4K/1080p MP4, WebM, and MKV video recordings.

---

### 10. 🛡️ Windows Resilience & Boot Auto-Start (পিসি চালু হলেই অটোমেটিক স্টার্ট)
* **Port Conflict & TIME_WAIT Protection:** Server socket includes `SO_REUSEADDR` and automated multi-retry loops so `server.exe` never crashes when restarted quickly.
* **Silent Background Auto-Start:** `Run-Background-Service.vbs` and `Install-AutoStart.bat` configure ZoneHub to launch silently in the background on Windows boot with zero console windows.
* **Easy Restart:** Double-click `Restart-Server.bat` to cleanly terminate old instances, auto-apply updates, and start fresh.

---

## 📂 Repository File Structure (ফাইল পরিচিতি)

```
├── server.cs                    # Multi-threaded C# HTTP/1.1 server source code
├── index.html                   # Single-page modern responsive web app
├── Restart-Server.bat           # 1-Click Server Restart & Auto-updater
├── Install-AutoStart.bat        # Configure silent auto-start on Windows login
├── Stop-Share-Server.bat        # 1-Click Stop (Kills running server process)
├── Run-Background-Service.vbs   # Native Windows silent background runner
├── Build.bat                    # Compiles server.cs using Windows built-in csc.exe
├── .gitignore                   # Ignores runtime databases, media, and temp caches
├── css/
│   └── style.css                # Dark-mode responsive UI styling & animations
├── js/
│   ├── app.js                   # Core state, view switching, notifications & admin
│   ├── chat.js                  # Team Chat, DMs, in-chat search & voice player
│   ├── media.js                 # Files & Media library, folder navigation & uploads
│   ├── p2p.js                   # WebRTC Peer-to-Peer direct file streaming engine
│   └── qrcode.js                # Offline Reed-Solomon vector QR code generator
├── Videos/                      # Video category library
├── Pictures/                    # Pictures category library
├── Documents/                   # Documents category library
└── messages.json                # Persistent chat message database
```

---

## 🚀 Quick Start Guide (ব্যবহার শুরুর সহজ নিয়ম)

### ১. সার্ভার চালু করা (Starting the Server)
1. ফোল্ডারে থাকা **`Restart-Server.bat`** ফাইলে ডাবল-ক্লিক করুন।
2. সার্ভার চালু হবে এবং আপনার লোকাল আইপি অ্যাড্রেস প্রদর্শন করবে (যেমন: `http://192.168.0.120:8080`).
3. আপনার ব্রাউজারে প্রবেশ করুন: **`http://localhost:8080`**.

---

### ২. মোবাইল ফোন দিয়ে কানেক্ট করা (Connecting from Mobile via QR Code)
1. হোস্ট পিসির ড্যাশবোর্ডের উপরে থাকা **📱 QR Code** বাটনে ক্লিক করুন।
2. আপনার আইফোন বা অ্যান্ড্রয়েড ফোনের ক্যামেরা দিয়ে স্ক্রিনের QR কোডটি স্ক্যান করুন।
3. কোনো আইপি টাইপ করা ছাড়াই আপনার ফোনে ZoneHub সাথে সাথে ওপেন হয়ে যাবে!

---

### ৩. অন্যান্য পিসি ও সহকর্মীদের সাথে শেয়ার করা (Connecting Colleague PCs)
যেকোনো ল্যাপটপ বা কম্পিউটার থেকে同一个 Wi-Fi-তে যুক্ত হয়ে হোস্ট পিসির আইপি অ্যাড্রেস টাইপ করুন:
```
http://<HOST_IP>:8080      (উদাহরণ: http://192.168.0.120:8080)
```
*অথবা ম্যাক ও উইন্ডোজের জন্য পিসি নাম ব্যবহার করতে পারেন:*
```
http://<PC_NAME>:8080      (উদাহরণ: http://DESKTOP-Q4J8832:8080)
```

---

### ৪. পিসি অন হলেই অটো-চালু রাখার নিয়ম (Auto-Start on Boot)
যদি চান অফিসের কম্পিউটার অন হওয়ার সাথে সাথে কোনো কিছু ওপেন না করেই ব্যাকগ্রাউন্ডে সার্ভার নিজে নিজে চালু হয়ে যাক:
1. **`Install-AutoStart.bat`** ফাইলে ডাবল-ক্লিক করুন।
2. এটি আপনার উইন্ডোজ স্টার্টআপে একটি সাইলেন্ট ব্যাকগ্রাউন্ড শর্টকাট তৈরি করবে।

---

### ৫. সার্ভার বন্ধ করতে চাইলে (Stopping the Server)
- **`Stop-Share-Server.bat`** ফাইলে ডাবল-ক্লিক করুন। এটি সাথে সাথে রানিং সার্ভার প্রসেস বন্ধ করে দেবে।

---

## 🛠️ Build & Compile From Source (সোর্স কোড থেকে কম্পাইল)

এই প্রজেক্টে কোনো Node.js, npm, Python বা বাইরের জটিল সফটওয়্যার প্রয়োজন হয় না। উইন্ডোজের নিজস্ব .NET ফ্রেমওয়ার্ক কম্পাইলার (`csc.exe`) দিয়ে মাত্র এক সেকেন্ডে কম্পাইল করা যায়:

```cmd
Build.bat
```

*ম্যানুয়াল কম্পাইল কমান্ড:*
```cmd
C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /target:exe /optimize+ /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll /out:server.exe server.cs
```

---

## 🛡️ License

Created and maintained for the **ZoneHub Community**. Built with pure vanilla technologies for maximum performance, security, and simplicity. Feel free to use and customize for your home or office network!
