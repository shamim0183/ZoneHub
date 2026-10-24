# 🚀 SkyCommerce Media Hub & Team Collaboration Server

> A lightweight, zero-dependency, self-hosted LAN & Internet media streaming and real-time team collaboration server built with native C# (`HttpListener` / `TcpListener`) and a modern Vanilla HTML5/CSS3/JavaScript responsive web interface.

[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20iOS%20%7C%20Android-blue.svg)](https://github.com/shamim0183/SkyCommerce-Media-Hub)
[![Mobile Responsive](https://img.shields.io/badge/Mobile-100%25%20Responsive%20(Samsung%20%7C%20iPhone%20%7C%20Android)-success.svg)](https://github.com/shamim0183/SkyCommerce-Media-Hub)
[![Runtime](https://img.shields.io/badge/.NET%20Framework-4.0%2B%20(Built--in)-green.svg)](https://github.com/shamim0183/SkyCommerce-Media-Hub)
[![Dependencies](https://img.shields.io/badge/Dependencies-Zero%20(No%20Node%2C%20No%20Python)-brightgreen.svg)](https://github.com/shamim0183/SkyCommerce-Media-Hub)

---

## ✨ Key Features

- **📱 100% Mobile & Cross-Device Responsive:**
  - Flawless, pixel-perfect layout across all screens (Samsung Galaxy A55, iPhones, Android devices, tablets, and 4K desktops).
  - Smart responsive tabs: automatically shifts from desktop split-view to clean, single-line mobile navigation tabs (`📁 Files` & `💬 Chat`) with zero text wrapping.
  - Adaptive touch controls, responsive upload folder picker, and touch-optimized chat interface.

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

- **🌐 Dynamic IP & Cloudflare Internet Tunnel:**
  - **Local LAN:** Automatically detects the current Wi-Fi IP on any router via UDP socket routing table probe.
  - **Home to Office Access:** Integrated Cloudflare Tunnel (`cloudflared`) creates a secure, global HTTPS link allowing you to connect from home or mobile cellular data (4G/5G) without port forwarding.

- **⚡ Zero External Dependencies:**
  - Compiles using Windows' built-in .NET Framework compiler (`csc.exe`). No Node.js, Python, or NuGet packages needed.

---

## 📁 Repository Structure

```
├── server.cs                    # Multi-threaded C# HTTP server source code
├── index.html                   # Single-page modern 100% responsive web app
├── Build.bat                    # 1-click compilation script (uses Windows csc.exe)
├── Start-Share-Server.bat       # Start server in a console window (Local LAN)
├── Start-Online-Tunnel.bat      # Start Cloudflare Internet Tunnel (Worldwide Access)
├── Stop-Share-Server.bat        # 1-Click Stop (Kills server & tunnel immediately)
├── Enable-AutoStart-NoLogin.bat # Configure boot autostart & firewall (Run as Admin)
├── Disable-AutoStart-NoLogin.bat# Remove boot autostart task (Run as Admin)
├── Run-Background-Service.vbs   # Silent native Windows background runner
├── .gitignore                   # Ignore media files, binaries, and logs
├── Videos/                      # Video files (streaming supported)
├── Pictures/                    # Image files & previews
├── Documents/                   # PDF, DOCX, ZIP, and other documents
└── Chat_Media/                  # Audio voice notes & chat image attachments
```

---

## ⚡ PC Boot Auto-Start & How to Turn Off (পিসি অন হলে অটো-চালু এবং বন্ধ করার নিয়ম)

### ১. পিসি অন হলেই যেন অটোমেটিক ব্যাকগ্রাউন্ডে চালু হয় (Enable Auto-Start)
যদি চান অফিসের পিসি অন হওয়ার সাথে সাথে কোনো লগইন ছাড়াই সার্ভার ও ইন্টারনেট টানেল নিজে থেকে চালু হয়ে যাক:
1. **`Enable-AutoStart-NoLogin.bat`** ফাইলটিতে মাউসের রাইট ক্লিক করুন।
2. **"Run as administrator"** সিলেক্ট করুন।
3. এটি উইন্ডোজ টাস্ক শিডিউলারে `SkyCommerceMediaHub_Boot` টাস্ক রেজিস্টার করবে এবং উইন্ডোজ ফায়ারওয়ালের পোর্ট ৮০৮০ খুলে দেবে।
> **ফলাফল:** পিসি অন হওয়ার সাথে সাথে কোনো উইন্ডো ওপেন হওয়া ছাড়াই ব্যাকগ্রাউন্ডে সার্ভার এবং ক্লাউডফ্লেয়ার টানেল চালু হয়ে যাবে। আপনি বাসায় বসে বা অন্য ডিভাইস থেকে সরাসরি কানেক্ট করতে পারবেন!

---

### ২. প্রয়োজনমতো যেভাবে বন্ধ করবেন (How to Turn Off Anytime)
আপনি যখন সার্ভার বা অনলাইন কানেকশন সাময়িকভাবে বন্ধ করতে চান:
- 📁 **`Stop-Share-Server.bat`** ফাইলটিতে ডাবল ক্লিক করুন।
- এটি তাৎক্ষণিকভাবে রানিং **`server.exe`** এবং **`cloudflared.exe`** বন্ধ করে দেবে।

---

### ৩. অটো-স্টার্ট সম্পূর্ণ মুছে ফেলতে চাইলে (Permanently Remove Auto-Start)
যদি ভবিষ্যতে আপনি পিসি বুটের সাথে অটো-চালু হওয়া বন্ধ করতে চান:
1. **`Disable-AutoStart-NoLogin.bat`** ফাইলটিতে রাইট ক্লিক করে **"Run as administrator"** দিন।
2. এটি উইন্ডোজ শিডিউলার থেকে অটো-স্টার্ট মুছে ফেলবে এবং রানিং প্রসেস বন্ধ করে দেবে।

---

### ৪. ম্যানুয়ালি নিজের ইচ্ছামতো চালু করতে (Manual Controls)
- **শুধু লোকাল Wi-Fi তে চালাতে:** `Start-Share-Server.bat` ডাবল ক্লিক করুন।
- **বাসা থেকে বা ইন্টারনেটের মাধ্যমে চালাতে:** `Start-Online-Tunnel.bat` ডাবল ক্লিক করুন।

---

## 🌐 Running Under Different Networks (বিভিন্ন নেটওয়ার্কে ব্যবহারের নিয়ম)

### Scenario A: একই Wi-Fi / লোকাল নেটওয়ার্কে (Office Wi-Fi / Hotspot)
1. মোবাইল ও পিসিকে একই Wi-Fi রাউটারের সাথে কানেক্ট করুন।
2. হোস্ট পিসির ড্যাশবোর্ডের উপরে প্রদর্শিত Wi-Fi লিংকে ঢুকুন:
   ```
   http://<LOCAL_IP>:8080   (উদাহরণ: http://192.168.0.109:8080)
   ```
   *বা ম্যাক ও উইন্ডোজের জন্য:* `http://<PC_NAME>:8080` (যেমন: `http://DESKTOP-Q4J8832:8080`)

### Scenario B: বাসা থেকে বা মোবাইল ডাটা দিয়ে (Outside Office / Internet)
অফিসের পিসি অন থাকলে আপনি বাসায় বসে মোবাইল বা যেকোনো কম্পিউটার থেকে সরাসরি কানেক্ট করতে পারবেন:
1. **`Start-Online-Tunnel.bat`** চালু করুন (বা অটো-স্টার্ট এনেবল থাকলে পিসি বুটেই চালু হয়ে যায়)।
2. স্ক্রিনে বা ড্যাশবোর্ডে প্রদর্শিত সুরক্ষিত **Cloudflare Public HTTPS Link**-এ ঢুকুন (যেমন: `https://xxxx.trycloudflare.com`)।
3. বাসা থেকে, রাস্তা থেকে বা পৃথিবীর যেকোনো প্রান্ত থেকে পুরো ড্যাশবোর্ড, ফাইল ও রিয়েল-টাইম টিম চ্যাট উপভোগ করুন!

---

## 🛠️ Build & Compile From Source

প্রজেক্টের সোর্স কোড কম্পাইল করার জন্য কোনো এক্সটার্নাল প্যাকেজ বা টুল ইনস্টল করতে হয় না। উইন্ডোজের নিজস্ব .NET কম্পাইলার ব্যবহার করে এক ক্লিকেই কম্পাইল করা যায়:
```cmd
Build.bat
```
*ম্যানুয়াল কম্পাইল কমান্ড:*
```cmd
C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /target:exe /optimize+ /out:server.exe server.cs
```

---

## 🛡️ License

This project is maintained for **SkyCommerce**. All rights reserved. Feel free to use and customize for your team or organization!
