using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Collections.Generic;
using System.Linq;
using System.Web.Script.Serialization;

namespace SkyCommerceMediaServer
{
    public class ChatMessage
    {
        public string id { get; set; }
        public string user { get; set; }
        public string userId { get; set; }
        public string text { get; set; }
        public string type { get; set; } // "text", "voice", "image"
        public string audioUrl { get; set; }
        public string imageUrl { get; set; }
        public string timestamp { get; set; }
        public bool edited { get; set; }
        public bool deleted { get; set; }
        public string deletedBy { get; set; }
        public Dictionary<string, List<string>> reactions { get; set; }
    }

    public class FileMetaItem
    {
        public string uploader { get; set; }
        public string uploadedAt { get; set; }
    }

    class RequestContext
    {
        public string Method = "";
        public string Url = "";
        public Dictionary<string, string> Headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        public byte[] LeftoverBuffer = new byte[0];
        public int LeftoverOffset = 0;
        public int LeftoverCount = 0;
        public string ClientIp = "";
        public bool IsLocalhost = false;
    }

    class Program
    {
        private static string RootDirectory = AppDomain.CurrentDomain.BaseDirectory;
        private static int Port = 8080;
        private static object MessagesLock = new object();
        private static object MetadataLock = new object();

        public static string GetCurrentLocalIp()
        {
            try
            {
                using (Socket socket = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, 0))
                {
                    socket.Connect("8.8.8.8", 65530);
                    IPEndPoint endPoint = socket.LocalEndPoint as IPEndPoint;
                    if (endPoint != null && !IPAddress.IsLoopback(endPoint.Address))
                    {
                        return endPoint.Address.ToString();
                    }
                }
            }
            catch {}

            try
            {
                foreach (var ip in Dns.GetHostEntry(Dns.GetHostName()).AddressList)
                {
                    if (ip.AddressFamily == AddressFamily.InterNetwork && 
                        !IPAddress.IsLoopback(ip) && 
                        !ip.ToString().StartsWith("169.254"))
                    {
                        return ip.ToString();
                    }
                }
            }
            catch {}

            return "127.0.0.1";
        }

        public static string GetHostName()
        {
            try
            {
                return Environment.MachineName;
            }
            catch
            {
                return "DESKTOP-PC";
            }
        }

        public static string GetCurrentOnlineTunnelUrl()
        {
            try
            {
                string txtPath = Path.Combine(RootDirectory, "online_url.txt");
                if (File.Exists(txtPath))
                {
                    string url = File.ReadAllText(txtPath, Encoding.UTF8).Trim();
                    if (url.StartsWith("https://") && url.Contains("trycloudflare.com")) return url;
                }

                string logPath = Path.Combine(RootDirectory, "cloudflared.log");
                if (File.Exists(logPath))
                {
                    using (FileStream fs = new FileStream(logPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                    using (StreamReader reader = new StreamReader(fs, Encoding.UTF8))
                    {
                        string line;
                        string foundUrl = null;
                        while ((line = reader.ReadLine()) != null)
                        {
                            int idx = line.IndexOf("https://");
                            if (idx >= 0)
                            {
                                int end = line.IndexOf(".trycloudflare.com", idx);
                                if (end > idx)
                                {
                                    foundUrl = line.Substring(idx, (end + 18) - idx).Trim();
                                }
                            }
                        }
                        if (!string.IsNullOrEmpty(foundUrl)) return foundUrl;
                    }
                }
            }
            catch {}
            return null;
        }

        static void Main(string[] args)
        {
            int customPort;
            if (args.Length > 0 && int.TryParse(args[0], out customPort))
            {
                Port = customPort;
            }

            TcpListener listener = null;
            try
            {
                listener = new TcpListener(IPAddress.Any, Port);
                listener.Start();
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("[ERROR] Could not start server on port " + Port + ": " + ex.Message);
                Console.ResetColor();
                Console.WriteLine("Press any key to exit...");
                try { Console.ReadKey(); } catch {}
                return;
            }

            string currentIp = GetCurrentLocalIp();
            string pcName = GetHostName();

            try { Console.Title = "SkyCommerce Media Hub & Team Chat - Port " + Port; } catch {}
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("==================================================================");
            Console.WriteLine("  🚀 SkyCommerce Media Hub & Advanced Team Chat is ONLINE");
            Console.WriteLine("==================================================================");
            Console.ResetColor();
            Console.WriteLine("📂 Shared Folder: " + RootDirectory);
            Console.WriteLine();
            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine("🔗 Localhost Link (For this PC):");
            Console.WriteLine("   http://localhost:" + Port);
            Console.WriteLine();
            Console.WriteLine("🌐 Mobile & Wi-Fi LAN Link (Share with everyone):");
            Console.WriteLine("   http://" + currentIp + ":" + Port);
            Console.WriteLine();
            Console.WriteLine("💻 Computer Name Link (For Mac/Windows on same Wi-Fi):");
            Console.WriteLine("   http://" + pcName + ":" + Port);
            Console.ResetColor();
            Console.WriteLine();
            Console.WriteLine("------------------------------------------------------------------");
            Console.WriteLine("🍎 100% Flawless Mac, iOS Safari, Android & Windows Compatibility");
            Console.WriteLine("✨ Automatic Startup, Picture Previews, Voice Notes & Reactions");
            Console.WriteLine("💡 Press Ctrl+C to stop the server anytime.");
            Console.WriteLine("==================================================================");
            Console.WriteLine();

            while (true)
            {
                try
                {
                    TcpClient client = listener.AcceptTcpClient();
                    ThreadPool.QueueUserWorkItem(HandleClient, client);
                }
                catch (Exception)
                {
                    break;
                }
            }
        }

        private static void HandleClient(object obj)
        {
            TcpClient client = (TcpClient)obj;
            NetworkStream stream = null;
            try
            {
                client.ReceiveTimeout = 600000;
                client.SendTimeout = 600000;
                stream = client.GetStream();

                RequestContext req = ParseRequest(stream, client);
                if (req == null)
                {
                    client.Close();
                    return;
                }

                // Handle CORS OPTIONS preflight for Mac Safari, iOS, Chrome
                if (req.Method == "OPTIONS")
                {
                    ServeOptionsPreflight(stream);
                    return;
                }

                string pathOnly = req.Url.Split('?')[0];
                string decodedPath = Uri.UnescapeDataString(pathOnly);

                // Handle GET / HEAD dashboard
                if ((req.Method == "GET" || req.Method == "HEAD") && (decodedPath == "/" || decodedPath.Equals("/index.html", StringComparison.OrdinalIgnoreCase)))
                {
                    ServeDashboard(stream, req.Method == "HEAD");
                    return;
                }

                // Handle GET my-info (PC default name)
                if (req.Method == "GET" && decodedPath.Equals("/api/my-info", StringComparison.OrdinalIgnoreCase))
                {
                    ServeMyInfo(stream, req);
                    return;
                }

                // Handle GET file list API
                if (req.Method == "GET" && decodedPath.Equals("/api/files", StringComparison.OrdinalIgnoreCase))
                {
                    ServeFilesJson(stream);
                    return;
                }

                // Handle GET folders list API
                if (req.Method == "GET" && decodedPath.Equals("/api/folders", StringComparison.OrdinalIgnoreCase))
                {
                    ServeFoldersJson(stream);
                    return;
                }

                // Handle POST create folder API
                if (req.Method == "POST" && decodedPath.Equals("/api/folders/create", StringComparison.OrdinalIgnoreCase))
                {
                    HandleCreateFolder(stream, req);
                    return;
                }

                // Handle POST file upload
                if (req.Method == "POST" && decodedPath.Equals("/upload", StringComparison.OrdinalIgnoreCase))
                {
                    HandleUpload(stream, req);
                    return;
                }

                // Chat API Endpoints
                if (decodedPath.Equals("/api/messages", StringComparison.OrdinalIgnoreCase))
                {
                    if (req.Method == "GET")
                    {
                        ServeMessagesJson(stream);
                        return;
                    }
                    if (req.Method == "POST")
                    {
                        HandleCreateMessage(stream, req);
                        return;
                    }
                }

                // Reaction endpoint
                if (req.Method == "POST" && decodedPath.Equals("/api/messages/react", StringComparison.OrdinalIgnoreCase))
                {
                    HandleReactMessage(stream, req);
                    return;
                }

                // Edit endpoint
                if (req.Method == "POST" && decodedPath.Equals("/api/messages/edit", StringComparison.OrdinalIgnoreCase))
                {
                    HandleEditMessage(stream, req);
                    return;
                }

                // Delete endpoint
                if (req.Method == "POST" && decodedPath.Equals("/api/messages/delete", StringComparison.OrdinalIgnoreCase))
                {
                    HandleDeleteMessage(stream, req);
                    return;
                }

                // Handle file serving (GET / HEAD)
                ServeFile(stream, decodedPath, req.Headers, req.Method == "HEAD");
            }
            catch
            {
                // Disconnected or closed
            }
            finally
            {
                try
                {
                    if (stream != null) stream.Dispose();
                    if (client != null) client.Close();
                }
                catch {}
            }
        }

        private static void ServeOptionsPreflight(NetworkStream stream)
        {
            StringBuilder sb = new StringBuilder();
            sb.Append("HTTP/1.1 204 No Content\r\n");
            sb.Append("Access-Control-Allow-Origin: *\r\n");
            sb.Append("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS, HEAD\r\n");
            sb.Append("Access-Control-Allow-Headers: *\r\n");
            sb.Append("Access-Control-Max-Age: 86400\r\n");
            sb.Append("Content-Length: 0\r\n");
            sb.Append("Connection: close\r\n\r\n");
            byte[] bytes = Encoding.UTF8.GetBytes(sb.ToString());
            try
            {
                stream.Write(bytes, 0, bytes.Length);
                stream.Flush();
            }
            catch {}
        }

        private static RequestContext ParseRequest(NetworkStream stream, TcpClient client)
        {
            byte[] buffer = new byte[8192];
            int totalRead = 0;
            int headerEndIndex = -1;
            int delimiterLength = 0;

            while (totalRead < buffer.Length)
            {
                int read = stream.Read(buffer, totalRead, buffer.Length - totalRead);
                if (read <= 0) break;
                totalRead += read;

                for (int i = 0; i < totalRead - 1; i++)
                {
                    if (buffer[i] == 10 && buffer[i + 1] == 10)
                    {
                        headerEndIndex = i;
                        delimiterLength = 2;
                        break;
                    }
                    if (i < totalRead - 3 && buffer[i] == 13 && buffer[i + 1] == 10 && buffer[i + 2] == 13 && buffer[i + 3] == 10)
                    {
                        headerEndIndex = i;
                        delimiterLength = 4;
                        break;
                    }
                }

                if (headerEndIndex != -1) break;
            }

            if (headerEndIndex == -1) return null;

            string headerString = Encoding.UTF8.GetString(buffer, 0, headerEndIndex);
            string[] lines = headerString.Split(new[] { "\r\n", "\n" }, StringSplitOptions.None);
            if (lines.Length == 0 || string.IsNullOrWhiteSpace(lines[0])) return null;

            string[] reqParts = lines[0].Trim().Split(' ');
            if (reqParts.Length < 2) return null;

            RequestContext ctx = new RequestContext();
            ctx.Method = reqParts[0].ToUpperInvariant();
            ctx.Url = reqParts[1];

            try
            {
                IPEndPoint ep = client.Client.RemoteEndPoint as IPEndPoint;
                if (ep != null)
                {
                    ctx.ClientIp = ep.Address.ToString();
                    ctx.IsLocalhost = IPAddress.IsLoopback(ep.Address) || ctx.ClientIp == "127.0.0.1" || ctx.ClientIp == "::1";
                }
            }
            catch {}

            for (int i = 1; i < lines.Length; i++)
            {
                int colon = lines[i].IndexOf(':');
                if (colon > 0)
                {
                    string k = lines[i].Substring(0, colon).Trim();
                    string v = lines[i].Substring(colon + 1).Trim();
                    ctx.Headers[k] = v;
                }
            }

            int bodyStartIndex = headerEndIndex + delimiterLength;
            int leftoverLength = totalRead - bodyStartIndex;
            if (leftoverLength > 0)
            {
                ctx.LeftoverBuffer = buffer;
                ctx.LeftoverOffset = bodyStartIndex;
                ctx.LeftoverCount = leftoverLength;
            }

            return ctx;
        }

        private static string ReadBodyString(NetworkStream stream, RequestContext req)
        {
            long contentLength = 0;
            if (req.Headers.ContainsKey("content-length"))
            {
                long.TryParse(req.Headers["content-length"], out contentLength);
            }

            if (contentLength <= 0 && req.LeftoverCount <= 0) return "";

            using (MemoryStream ms = new MemoryStream())
            {
                if (req.LeftoverCount > 0)
                {
                    int toWrite = (int)Math.Min((long)req.LeftoverCount, contentLength > 0 ? contentLength : req.LeftoverCount);
                    ms.Write(req.LeftoverBuffer, req.LeftoverOffset, toWrite);
                }

                byte[] buf = new byte[4096];
                long remaining = contentLength - ms.Length;
                while (remaining > 0)
                {
                    int toRead = (int)Math.Min((long)buf.Length, remaining);
                    int read = stream.Read(buf, 0, toRead);
                    if (read <= 0) break;
                    ms.Write(buf, 0, read);
                    remaining -= read;
                }
                return Encoding.UTF8.GetString(ms.ToArray());
            }
        }

        #region My Info (PC Name Detection)
        private static void ServeMyInfo(NetworkStream stream, RequestContext req)
        {
            string defaultName = "";
            if (req.IsLocalhost)
            {
                defaultName = Environment.UserName;
            }
            else if (!string.IsNullOrEmpty(req.ClientIp))
            {
                try
                {
                    IPAddress ip;
                    if (IPAddress.TryParse(req.ClientIp, out ip))
                    {
                        var entry = Dns.GetHostEntry(ip);
                        if (entry != null && !string.IsNullOrEmpty(entry.HostName))
                        {
                            defaultName = entry.HostName.Split('.')[0];
                        }
                    }
                }
                catch {}
            }

            if (string.IsNullOrEmpty(defaultName))
            {
                string ipTail = req.ClientIp.Replace(".", "_").Replace(":", "_");
                defaultName = "Employee_" + (ipTail.Length > 3 ? ipTail.Substring(ipTail.Length - 3) : "PC");
            }

            JavaScriptSerializer js = new JavaScriptSerializer();
            var dict = new Dictionary<string, object>();
            dict["defaultName"] = defaultName;
            dict["clientIp"] = req.ClientIp;
            dict["isHost"] = req.IsLocalhost;

            SendJsonResponse(stream, 200, js.Serialize(dict));
        }
        #endregion

        #region Chat Methods
        private static string GetMessagesFilePath()
        {
            return Path.Combine(RootDirectory, "messages.json");
        }

        private static List<ChatMessage> LoadMessages()
        {
            lock (MessagesLock)
            {
                string path = GetMessagesFilePath();
                if (!File.Exists(path)) return new List<ChatMessage>();
                try
                {
                    string json = File.ReadAllText(path, Encoding.UTF8);
                    JavaScriptSerializer js = new JavaScriptSerializer();
                    return js.Deserialize<List<ChatMessage>>(json) ?? new List<ChatMessage>();
                }
                catch
                {
                    return new List<ChatMessage>();
                }
            }
        }

        private static void SaveMessages(List<ChatMessage> list)
        {
            lock (MessagesLock)
            {
                string path = GetMessagesFilePath();
                JavaScriptSerializer js = new JavaScriptSerializer();
                string json = js.Serialize(list);
                File.WriteAllText(path, json, Encoding.UTF8);
            }
        }

        private static void ServeMessagesJson(NetworkStream stream)
        {
            var list = LoadMessages();
            JavaScriptSerializer js = new JavaScriptSerializer();
            string json = js.Serialize(list);
            SendJsonResponse(stream, 200, json);
        }

        private static void HandleCreateMessage(NetworkStream stream, RequestContext req)
        {
            string body = ReadBodyString(stream, req);
            JavaScriptSerializer js = new JavaScriptSerializer();
            ChatMessage input = null;
            try
            {
                input = js.Deserialize<ChatMessage>(body);
            }
            catch {}

            if (input == null || (string.IsNullOrWhiteSpace(input.text) && string.IsNullOrEmpty(input.audioUrl) && string.IsNullOrEmpty(input.imageUrl)))
            {
                SendJsonResponse(stream, 400, "{\"success\":false,\"error\":\"Message text, audio, or image required\"}");
                return;
            }

            ChatMessage newMsg = new ChatMessage();
            newMsg.id = Guid.NewGuid().ToString("N");
            newMsg.user = string.IsNullOrWhiteSpace(input.user) ? "Employee" : input.user.Trim();
            newMsg.userId = string.IsNullOrWhiteSpace(input.userId) ? "" : input.userId.Trim();
            newMsg.text = input.text != null ? input.text.Trim() : "";
            newMsg.type = string.IsNullOrEmpty(input.type) ? "text" : input.type;
            newMsg.audioUrl = input.audioUrl;
            newMsg.imageUrl = input.imageUrl;
            newMsg.timestamp = DateTime.Now.ToString("hh:mm tt, MMM dd");
            newMsg.edited = false;
            newMsg.deleted = false;
            newMsg.reactions = new Dictionary<string, List<string>>();

            var list = LoadMessages();
            list.Add(newMsg);
            SaveMessages(list);

            Console.WriteLine("[CHAT] " + newMsg.user + ": " + (newMsg.type == "voice" ? "🎤 [Voice Message]" : (newMsg.type == "image" ? "📷 [Picture Sent]" : newMsg.text)));
            string resJson = "{\"success\":true,\"message\":" + js.Serialize(newMsg) + "}";
            SendJsonResponse(stream, 200, resJson);
        }

        private static void HandleReactMessage(NetworkStream stream, RequestContext req)
        {
            string body = ReadBodyString(stream, req);
            JavaScriptSerializer js = new JavaScriptSerializer();
            Dictionary<string, string> input = null;
            try
            {
                input = js.Deserialize<Dictionary<string, string>>(body);
            }
            catch {}

            if (input == null || !input.ContainsKey("id") || !input.ContainsKey("emoji") || !input.ContainsKey("user"))
            {
                SendJsonResponse(stream, 400, "{\"success\":false,\"error\":\"id, emoji, and user required\"}");
                return;
            }

            string msgId = input["id"];
            string emoji = input["emoji"];
            string user = input["user"];

            var list = LoadMessages();
            var target = list.FirstOrDefault(m => m.id == msgId);
            if (target != null && !target.deleted)
            {
                if (target.reactions == null)
                {
                    target.reactions = new Dictionary<string, List<string>>();
                }

                if (!target.reactions.ContainsKey(emoji))
                {
                    target.reactions[emoji] = new List<string>();
                }

                if (target.reactions[emoji].Contains(user))
                {
                    target.reactions[emoji].Remove(user);
                    if (target.reactions[emoji].Count == 0)
                    {
                        target.reactions.Remove(emoji);
                    }
                }
                else
                {
                    target.reactions[emoji].Add(user);
                }

                SaveMessages(list);
                SendJsonResponse(stream, 200, "{\"success\":true}");
            }
            else
            {
                SendJsonResponse(stream, 404, "{\"success\":false,\"error\":\"Message not found or deleted\"}");
            }
        }

        private static void HandleEditMessage(NetworkStream stream, RequestContext req)
        {
            string body = ReadBodyString(stream, req);
            JavaScriptSerializer js = new JavaScriptSerializer();
            ChatMessage input = null;
            try
            {
                input = js.Deserialize<ChatMessage>(body);
            }
            catch {}

            if (input == null || string.IsNullOrEmpty(input.id) || string.IsNullOrWhiteSpace(input.text))
            {
                SendJsonResponse(stream, 400, "{\"success\":false,\"error\":\"id and text required\"}");
                return;
            }

            var list = LoadMessages();
            var target = list.FirstOrDefault(m => m.id == input.id);
            if (target != null)
            {
                if (!string.IsNullOrEmpty(target.userId) && !string.IsNullOrEmpty(input.userId) && target.userId != input.userId && !req.IsLocalhost)
                {
                    SendJsonResponse(stream, 403, "{\"success\":false,\"error\":\"You can only edit your own message!\"}");
                    return;
                }

                target.text = input.text.Trim();
                target.edited = true;
                SaveMessages(list);
                Console.WriteLine("[CHAT EDITED] " + target.user + ": " + target.text);
                SendJsonResponse(stream, 200, "{\"success\":true}");
            }
            else
            {
                SendJsonResponse(stream, 404, "{\"success\":false,\"error\":\"Message not found\"}");
            }
        }

        private static void HandleDeleteMessage(NetworkStream stream, RequestContext req)
        {
            string body = ReadBodyString(stream, req);
            JavaScriptSerializer js = new JavaScriptSerializer();
            Dictionary<string, string> input = null;
            try
            {
                input = js.Deserialize<Dictionary<string, string>>(body);
            }
            catch {}

            string msgId = "";
            string userId = "";
            if (input != null)
            {
                if (input.ContainsKey("id")) msgId = input["id"];
                if (input.ContainsKey("userId")) userId = input["userId"];
            }

            if (string.IsNullOrEmpty(msgId))
            {
                SendJsonResponse(stream, 400, "{\"success\":false,\"error\":\"id required\"}");
                return;
            }

            var list = LoadMessages();
            var target = list.FirstOrDefault(m => m.id == msgId);
            if (target != null)
            {
                if (!string.IsNullOrEmpty(target.userId) && !string.IsNullOrEmpty(userId) && target.userId != userId && !req.IsLocalhost)
                {
                    SendJsonResponse(stream, 403, "{\"success\":false,\"error\":\"You can only delete your own message!\"}");
                    return;
                }

                target.deleted = true;
                target.deletedBy = target.user;
                target.text = "🚫 এই মেসেজটি মুছে ফেলা হয়েছে (" + target.user + " deleted this message)";
                target.audioUrl = null;
                target.imageUrl = null;
                target.reactions = new Dictionary<string, List<string>>();
                SaveMessages(list);

                Console.WriteLine("[CHAT DELETED] " + target.user + " deleted message " + msgId);
                SendJsonResponse(stream, 200, "{\"success\":true}");
            }
            else
            {
                SendJsonResponse(stream, 404, "{\"success\":false,\"error\":\"Message not found\"}");
            }
        }

        private static void SendJsonResponse(NetworkStream stream, int statusCode, string json)
        {
            byte[] bodyBytes = Encoding.UTF8.GetBytes(json);
            StringBuilder res = new StringBuilder();
            res.Append("HTTP/1.1 " + statusCode + (statusCode == 200 ? " OK" : " Error") + "\r\n");
            res.Append("Content-Type: application/json; charset=utf-8\r\n");
            res.Append("Content-Length: " + bodyBytes.Length + "\r\n");
            res.Append("Access-Control-Allow-Origin: *\r\n");
            res.Append("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS, HEAD\r\n");
            res.Append("Access-Control-Allow-Headers: *\r\n");
            res.Append("Cache-Control: no-cache\r\n");
            res.Append("Connection: close\r\n\r\n");

            byte[] hBytes = Encoding.UTF8.GetBytes(res.ToString());
            try
            {
                stream.Write(hBytes, 0, hBytes.Length);
                stream.Write(bodyBytes, 0, bodyBytes.Length);
                stream.Flush();
            }
            catch {}
        }
        #endregion

        #region File Metadata
        private static string GetMetaFilePath()
        {
            return Path.Combine(RootDirectory, "file_metadata.json");
        }

        private static Dictionary<string, FileMetaItem> LoadFileMetadata()
        {
            lock (MetadataLock)
            {
                string path = GetMetaFilePath();
                if (!File.Exists(path)) return new Dictionary<string, FileMetaItem>(StringComparer.OrdinalIgnoreCase);
                try
                {
                    string json = File.ReadAllText(path, Encoding.UTF8);
                    JavaScriptSerializer js = new JavaScriptSerializer();
                    return js.Deserialize<Dictionary<string, FileMetaItem>>(json) ?? new Dictionary<string, FileMetaItem>(StringComparer.OrdinalIgnoreCase);
                }
                catch
                {
                    return new Dictionary<string, FileMetaItem>(StringComparer.OrdinalIgnoreCase);
                }
            }
        }

        private static void SaveFileMetadata(Dictionary<string, FileMetaItem> dict)
        {
            lock (MetadataLock)
            {
                string path = GetMetaFilePath();
                JavaScriptSerializer js = new JavaScriptSerializer();
                string json = js.Serialize(dict);
                File.WriteAllText(path, json, Encoding.UTF8);
            }
        }
        #endregion

        private static bool IsValidSharedFile(FileInfo f)
        {
            if (f.Attributes.HasFlag(FileAttributes.Hidden)) return false;
            string ext = f.Extension.ToLowerInvariant();
            if (ext == ".exe" || ext == ".cs" || ext == ".bat" || ext == ".cmd" || ext == ".ps1" || ext == ".vbs") return false;
            string name = f.Name;
            if (name.Equals("index.html", StringComparison.OrdinalIgnoreCase) ||
                name.Equals("messages.json", StringComparison.OrdinalIgnoreCase) ||
                name.Equals("file_metadata.json", StringComparison.OrdinalIgnoreCase) ||
                name.Equals("server.pdb", StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }
            return true;
        }

        private static string FindFileInSubfolders(string root, string fileName)
        {
            if (string.IsNullOrEmpty(fileName)) return null;
            try
            {
                string[] priorityFolders = new string[] { "Videos", "Pictures", "Chat_Media", "Documents" };
                foreach (var p in priorityFolders)
                {
                    string candidate = Path.Combine(root, p, fileName);
                    if (File.Exists(candidate)) return candidate;
                }

                foreach (var dir in Directory.GetDirectories(root))
                {
                    DirectoryInfo dInfo = new DirectoryInfo(dir);
                    if (dInfo.Attributes.HasFlag(FileAttributes.Hidden) || dInfo.Name.StartsWith(".") || dInfo.Name.Equals("bin", StringComparison.OrdinalIgnoreCase)) continue;
                    string candidate = Path.Combine(dir, fileName);
                    if (File.Exists(candidate)) return candidate;
                }
            }
            catch {}
            return null;
        }

        private static void HandleUpload(NetworkStream stream, RequestContext req)
        {
            string rawName = "";
            string requestedFolder = "";

            int qIndex = req.Url.IndexOf('?');
            if (qIndex >= 0)
            {
                string query = req.Url.Substring(qIndex + 1);
                string[] parts = query.Split('&');
                foreach (var p in parts)
                {
                    if (p.StartsWith("filename=", StringComparison.OrdinalIgnoreCase))
                    {
                        rawName = Uri.UnescapeDataString(p.Substring(9));
                    }
                    else if (p.StartsWith("folder=", StringComparison.OrdinalIgnoreCase))
                    {
                        requestedFolder = Uri.UnescapeDataString(p.Substring(7));
                    }
                }
            }

            if (string.IsNullOrEmpty(rawName) && req.Headers.ContainsKey("x-filename"))
            {
                rawName = Uri.UnescapeDataString(req.Headers["x-filename"]);
            }
            if (string.IsNullOrEmpty(requestedFolder) && req.Headers.ContainsKey("x-folder"))
            {
                requestedFolder = Uri.UnescapeDataString(req.Headers["x-folder"]);
            }

            if (string.IsNullOrEmpty(rawName))
            {
                rawName = "uploaded_" + DateTime.Now.ToString("yyyyMMdd_HHmmss") + ".dat";
            }

            string safeName = Path.GetFileName(rawName);
            foreach (char c in Path.GetInvalidFileNameChars())
            {
                safeName = safeName.Replace(c, '_');
            }

            string ext = Path.GetExtension(safeName).ToLowerInvariant();
            if (ext == ".exe" || ext == ".bat" || ext == ".cmd" || ext == ".ps1" || ext == ".vbs")
            {
                safeName += ".txt";
            }

            // Determine target subfolder
            string targetSubFolder = "";
            if (!string.IsNullOrEmpty(requestedFolder) && !requestedFolder.Equals("auto", StringComparison.OrdinalIgnoreCase))
            {
                targetSubFolder = Path.GetFileName(requestedFolder);
                foreach (char c in Path.GetInvalidFileNameChars())
                {
                    targetSubFolder = targetSubFolder.Replace(c, '_');
                }
            }
            else
            {
                if (safeName.StartsWith("chat_", StringComparison.OrdinalIgnoreCase) || safeName.StartsWith("voice_", StringComparison.OrdinalIgnoreCase))
                {
                    targetSubFolder = "Chat_Media";
                }
                else if (ext == ".mp4" || ext == ".mov" || ext == ".webm" || ext == ".mkv" || ext == ".avi")
                {
                    targetSubFolder = "Videos";
                }
                else if (ext == ".png" || ext == ".jpg" || ext == ".jpeg" || ext == ".webp" || ext == ".svg" || ext == ".gif" || ext == ".bmp")
                {
                    targetSubFolder = "Pictures";
                }
                else if (ext == ".pdf" || ext == ".docx" || ext == ".doc" || ext == ".xlsx" || ext == ".xls" || ext == ".pptx" || ext == ".txt" || ext == ".zip" || ext == ".rar")
                {
                    targetSubFolder = "Documents";
                }
                else
                {
                    targetSubFolder = "Documents";
                }
            }

            string targetDir = string.IsNullOrEmpty(targetSubFolder) ? RootDirectory : Path.Combine(RootDirectory, targetSubFolder);
            if (!Directory.Exists(targetDir))
            {
                try { Directory.CreateDirectory(targetDir); } catch {}
            }

            string targetPath = Path.Combine(targetDir, safeName);
            int duplicateCount = 1;
            string nameWithoutExt = Path.GetFileNameWithoutExtension(safeName);
            string extension = Path.GetExtension(safeName);
            while (File.Exists(targetPath))
            {
                safeName = nameWithoutExt + "_" + duplicateCount + extension;
                targetPath = Path.Combine(targetDir, safeName);
                duplicateCount++;
            }

            long contentLength = 0;
            if (req.Headers.ContainsKey("content-length"))
            {
                long.TryParse(req.Headers["content-length"], out contentLength);
            }

            long totalWritten = 0;
            using (FileStream fs = new FileStream(targetPath, FileMode.Create, FileAccess.Write, FileShare.None))
            {
                if (req.LeftoverCount > 0)
                {
                    int bytesToWrite = req.LeftoverCount;
                    if (contentLength > 0 && bytesToWrite > contentLength)
                    {
                        bytesToWrite = (int)contentLength;
                    }
                    fs.Write(req.LeftoverBuffer, req.LeftoverOffset, bytesToWrite);
                    totalWritten += bytesToWrite;
                }

                byte[] chunk = new byte[64 * 1024];
                while (contentLength == 0 || totalWritten < contentLength)
                {
                    int toRead = chunk.Length;
                    if (contentLength > 0)
                    {
                        toRead = (int)Math.Min(chunk.Length, contentLength - totalWritten);
                        if (toRead <= 0) break;
                    }

                    int read = stream.Read(chunk, 0, toRead);
                    if (read <= 0) break;

                    fs.Write(chunk, 0, read);
                    totalWritten += read;
                }
                fs.Flush();
            }

            // Determine uploader name
            string uploader = "";
            if (req.Headers.ContainsKey("x-uploader"))
            {
                uploader = Uri.UnescapeDataString(req.Headers["x-uploader"]);
            }
            if (string.IsNullOrEmpty(uploader) || uploader.Equals("Employee", StringComparison.OrdinalIgnoreCase))
            {
                if (req.IsLocalhost) uploader = Environment.UserName;
                else if (!string.IsNullOrEmpty(req.ClientIp))
                {
                    try
                    {
                        var entry = Dns.GetHostEntry(IPAddress.Parse(req.ClientIp));
                        if (entry != null && !string.IsNullOrEmpty(entry.HostName)) uploader = entry.HostName.Split('.')[0];
                    }
                    catch {}
                }
            }
            if (string.IsNullOrEmpty(uploader)) uploader = Environment.UserName;

            string relPath = string.IsNullOrEmpty(targetSubFolder) ? safeName : (targetSubFolder + "/" + safeName);

            var metaDict = LoadFileMetadata();
            var metaItem = new FileMetaItem {
                uploader = uploader,
                uploadedAt = DateTime.Now.ToString("MMM dd, yyyy - hh:mm tt")
            };
            metaDict[safeName] = metaItem;
            metaDict[relPath] = metaItem;
            SaveFileMetadata(metaDict);

            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine("[UPLOAD COMPLETED] " + relPath + " (" + FormatBytes(totalWritten) + ") from " + uploader);
            Console.ResetColor();

            string json = "{\"success\":true,\"filename\":\"" + JsonEscape(safeName) + "\",\"relativePath\":\"" + JsonEscape(relPath) + "\",\"folder\":\"" + JsonEscape(targetSubFolder) + "\",\"size\":" + totalWritten + "}";
            SendJsonResponse(stream, 200, json);
        }

        private static void HandleCreateFolder(NetworkStream stream, RequestContext req)
        {
            string folderName = "";

            int qIndex = req.Url.IndexOf("?name=");
            if (qIndex >= 0)
            {
                folderName = Uri.UnescapeDataString(req.Url.Substring(qIndex + 6));
                int amp = folderName.IndexOf('&');
                if (amp >= 0) folderName = folderName.Substring(0, amp);
            }

            if (string.IsNullOrEmpty(folderName))
            {
                string body = ReadBodyString(stream, req);
                if (!string.IsNullOrEmpty(body))
                {
                    try
                    {
                        JavaScriptSerializer js = new JavaScriptSerializer();
                        var dict = js.Deserialize<Dictionary<string, object>>(body);
                        if (dict != null && dict.ContainsKey("name") && dict["name"] != null)
                        {
                            folderName = dict["name"].ToString();
                        }
                    }
                    catch {}
                }
            }

            folderName = folderName != null ? folderName.Trim() : "";
            if (string.IsNullOrEmpty(folderName))
            {
                SendJsonResponse(stream, 400, "{\"success\":false,\"error\":\"Folder name is required\"}");
                return;
            }

            string safeFolderName = Path.GetFileName(folderName);
            foreach (char c in Path.GetInvalidFileNameChars())
            {
                safeFolderName = safeFolderName.Replace(c, '_');
            }

            string targetDir = Path.Combine(RootDirectory, safeFolderName);
            try
            {
                if (!Directory.Exists(targetDir))
                {
                    Directory.CreateDirectory(targetDir);
                    Console.WriteLine("[FOLDER CREATED] " + safeFolderName);
                }
                SendJsonResponse(stream, 200, "{\"success\":true,\"name\":\"" + JsonEscape(safeFolderName) + "\"}");
            }
            catch (Exception ex)
            {
                SendJsonResponse(stream, 500, "{\"success\":false,\"error\":\"" + JsonEscape(ex.Message) + "\"}");
            }
        }

        private static void ServeFoldersJson(NetworkStream stream)
        {
            var standardFolders = new string[] { "Videos", "Pictures", "Chat_Media", "Documents" };
            foreach (var sf in standardFolders)
            {
                string p = Path.Combine(RootDirectory, sf);
                if (!Directory.Exists(p))
                {
                    try { Directory.CreateDirectory(p); } catch {}
                }
            }

            var rootDi = new DirectoryInfo(RootDirectory);
            var allDirs = rootDi.GetDirectories()
                .Where(d => !d.Attributes.HasFlag(FileAttributes.Hidden) &&
                            !d.Name.StartsWith(".") &&
                            !d.Name.Equals("bin", StringComparison.OrdinalIgnoreCase) &&
                            !d.Name.Equals("obj", StringComparison.OrdinalIgnoreCase))
                .OrderBy(d => d.Name)
                .ToList();

            StringBuilder sb = new StringBuilder();
            sb.Append("[");
            for (int i = 0; i < allDirs.Count; i++)
            {
                var d = allDirs[i];
                long totalBytes = 0;
                int fileCount = 0;
                try
                {
                    var files = d.GetFiles("*", SearchOption.AllDirectories).Where(IsValidSharedFile).ToList();
                    fileCount = files.Count;
                    foreach (var f in files) totalBytes += f.Length;
                }
                catch {}

                string icon = "📁";
                string displayName = d.Name;
                string color = "indigo";

                if (d.Name.Equals("Videos", StringComparison.OrdinalIgnoreCase))
                {
                    icon = "🎥";
                    displayName = "Videos (ভিডিও)";
                    color = "cyan";
                }
                else if (d.Name.Equals("Pictures", StringComparison.OrdinalIgnoreCase))
                {
                    icon = "🖼️";
                    displayName = "Pictures (ছবি)";
                    color = "rose";
                }
                else if (d.Name.Equals("Chat_Media", StringComparison.OrdinalIgnoreCase))
                {
                    icon = "💬";
                    displayName = "Chat Media (চ্যাট মিডিয়া)";
                    color = "emerald";
                }
                else if (d.Name.Equals("Documents", StringComparison.OrdinalIgnoreCase))
                {
                    icon = "📄";
                    displayName = "Documents (ডকুমেন্টস)";
                    color = "amber";
                }

                sb.Append("{");
                sb.Append("\"id\":\"" + JsonEscape(d.Name) + "\",");
                sb.Append("\"name\":\"" + JsonEscape(d.Name) + "\",");
                sb.Append("\"displayName\":\"" + JsonEscape(displayName) + "\",");
                sb.Append("\"icon\":\"" + JsonEscape(icon) + "\",");
                sb.Append("\"color\":\"" + JsonEscape(color) + "\",");
                sb.Append("\"fileCount\":" + fileCount + ",");
                sb.Append("\"totalBytes\":" + totalBytes + ",");
                sb.Append("\"sizeFormatted\":\"" + JsonEscape(FormatBytes(totalBytes)) + "\"");
                sb.Append("}");
                if (i < allDirs.Count - 1) sb.Append(",");
            }
            sb.Append("]");

            SendJsonResponse(stream, 200, sb.ToString());
        }

        private static void ServeFilesJson(NetworkStream stream)
        {
            List<FileInfo> allFiles = new List<FileInfo>();
            try
            {
                DirectoryInfo rootDi = new DirectoryInfo(RootDirectory);
                foreach (var f in rootDi.GetFiles())
                {
                    if (IsValidSharedFile(f)) allFiles.Add(f);
                }

                foreach (var dir in rootDi.GetDirectories())
                {
                    if (dir.Attributes.HasFlag(FileAttributes.Hidden) || 
                        dir.Name.StartsWith(".") || 
                        dir.Name.Equals("bin", StringComparison.OrdinalIgnoreCase) ||
                        dir.Name.Equals("obj", StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }
                    try
                    {
                        foreach (var f in dir.GetFiles("*", SearchOption.AllDirectories))
                        {
                            if (IsValidSharedFile(f)) allFiles.Add(f);
                        }
                    }
                    catch {}
                }
            }
            catch {}

            allFiles = allFiles.OrderByDescending(f => f.LastWriteTime).ToList();
            var metaDict = LoadFileMetadata();

            StringBuilder sb = new StringBuilder();
            sb.Append("[");
            for (int i = 0; i < allFiles.Count; i++)
            {
                var f = allFiles[i];
                string ext = f.Extension.ToLowerInvariant();
                string fileType = "other";
                if (ext == ".mp4" || ext == ".webm" || ext == ".mkv" || ext == ".mov" || ext == ".avi") fileType = "video";
                else if (ext == ".gif") fileType = "gif";
                else if (ext == ".png" || ext == ".jpg" || ext == ".jpeg" || ext == ".webp" || ext == ".svg" || ext == ".bmp") fileType = "image";
                else if (ext == ".wav" || ext == ".mp3" || ext == ".ogg" || ext == ".m4a" || ext == ".aac") fileType = "audio";
                else if (ext == ".pdf" || ext == ".docx" || ext == ".doc" || ext == ".xlsx" || ext == ".xls" || ext == ".pptx" || ext == ".txt" || ext == ".zip" || ext == ".rar") fileType = "document";

                string rel = f.FullName.Substring(RootDirectory.Length).TrimStart('\\', '/').Replace('\\', '/');
                string folderName = "Root";
                int slashIdx = rel.IndexOf('/');
                if (slashIdx > 0)
                {
                    folderName = rel.Substring(0, slashIdx);
                }

                string uploader = "";
                if (metaDict.ContainsKey(rel)) uploader = metaDict[rel].uploader;
                else if (metaDict.ContainsKey(f.Name)) uploader = metaDict[f.Name].uploader;

                if (string.IsNullOrEmpty(uploader) || uploader.Equals("Company Shared", StringComparison.OrdinalIgnoreCase))
                {
                    uploader = Environment.UserName;
                }

                sb.Append("{");
                sb.Append("\"name\":\"" + JsonEscape(f.Name) + "\",");
                sb.Append("\"relativePath\":\"" + JsonEscape(rel) + "\",");
                sb.Append("\"url\":\"/" + JsonEscape(rel) + "\",");
                sb.Append("\"folder\":\"" + JsonEscape(folderName) + "\",");
                sb.Append("\"size\":" + f.Length + ",");
                sb.Append("\"sizeFormatted\":\"" + JsonEscape(FormatBytes(f.Length)) + "\",");
                sb.Append("\"date\":\"" + JsonEscape(f.LastWriteTime.ToString("MMM dd, yyyy - hh:mm tt")) + "\",");
                sb.Append("\"type\":\"" + fileType + "\",");
                sb.Append("\"uploader\":\"" + JsonEscape(uploader) + "\",");
                sb.Append("\"isVideo\":" + (fileType == "video" ? "true" : "false") + ",");
                sb.Append("\"isImage\":" + (fileType == "image" ? "true" : "false") + ",");
                sb.Append("\"isGif\":" + (fileType == "gif" ? "true" : "false") + ",");
                sb.Append("\"isDocument\":" + (fileType == "document" ? "true" : "false"));
                sb.Append("}");
                if (i < allFiles.Count - 1) sb.Append(",");
            }
            sb.Append("]");

            SendJsonResponse(stream, 200, sb.ToString());
        }

        private static string JsonEscape(string text)
        {
            if (string.IsNullOrEmpty(text)) return "";
            return text.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "").Replace("\n", "\\n");
        }

        private static void ServeDashboard(NetworkStream stream, bool headOnly)
        {
            string htmlPath = Path.Combine(RootDirectory, "index.html");
            string html = "";
            string currentIp = GetCurrentLocalIp();
            string machineName = GetHostName();

            if (File.Exists(htmlPath))
            {
                html = File.ReadAllText(htmlPath, Encoding.UTF8);
                string onlineUrl = GetCurrentOnlineTunnelUrl();
                html = html.Replace("{{LOCAL_IP}}", currentIp).Replace("{{HOSTNAME}}", machineName);
                if (!string.IsNullOrEmpty(onlineUrl))
                {
                    html = html.Replace("{{ONLINE_URL}}", onlineUrl);
                    html = html.Replace("id=\"onlineLinkGroup\" style=\"display:none;", "id=\"onlineLinkGroup\" style=\"display:flex;");
                }
            }
            else
            {
                html = "<!DOCTYPE html><html><body><h1>SkyCommerce Media Hub</h1><p>index.html not found</p></body></html>";
            }

            byte[] bytes = Encoding.UTF8.GetBytes(html);

            StringBuilder response = new StringBuilder();
            response.Append("HTTP/1.1 200 OK\r\n");
            response.Append("Content-Type: text/html; charset=utf-8\r\n");
            response.Append("Content-Length: " + bytes.Length + "\r\n");
            response.Append("Access-Control-Allow-Origin: *\r\n");
            response.Append("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS, HEAD\r\n");
            response.Append("Access-Control-Allow-Headers: *\r\n");
            response.Append("Cache-Control: no-cache, no-store, must-revalidate\r\n");
            response.Append("Connection: close\r\n\r\n");

            byte[] headerBytes = Encoding.UTF8.GetBytes(response.ToString());
            stream.Write(headerBytes, 0, headerBytes.Length);
            if (!headOnly)
            {
                stream.Write(bytes, 0, bytes.Length);
            }
            stream.Flush();
        }

        private static void ServeFile(NetworkStream stream, string relativePath, Dictionary<string, string> headers, bool headOnly)
        {
            string cleanRel = relativePath.TrimStart('/', '\\').Replace('/', Path.DirectorySeparatorChar);
            string fullPath = Path.GetFullPath(Path.Combine(RootDirectory, cleanRel));

            if (!fullPath.StartsWith(RootDirectory, StringComparison.OrdinalIgnoreCase) || !File.Exists(fullPath))
            {
                // Fallback: Check if file exists in any subfolder!
                string fileName = Path.GetFileName(cleanRel);
                string found = FindFileInSubfolders(RootDirectory, fileName);
                if (found != null && File.Exists(found))
                {
                    fullPath = found;
                }
                else
                {
                    SendError(stream, 404, "File Not Found");
                    return;
                }
            }

            FileInfo fi = new FileInfo(fullPath);
            long fileLength = fi.Length;
            string contentType = GetMimeType(fi.Extension);

            long start = 0;
            long end = fileLength - 1;
            bool isPartial = false;

            // Robust HTTP Range handling for Mac Safari, iOS, Chrome, Edge
            if (headers.ContainsKey("range"))
            {
                string rangeHeader = headers["range"];
                if (rangeHeader.StartsWith("bytes=", StringComparison.OrdinalIgnoreCase))
                {
                    string rangeSpec = rangeHeader.Substring(6).Trim();
                    string[] rangeParts = rangeSpec.Split('-');

                    if (!string.IsNullOrEmpty(rangeParts[0]))
                    {
                        long.TryParse(rangeParts[0], out start);
                        if (rangeParts.Length > 1 && !string.IsNullOrEmpty(rangeParts[1]))
                        {
                            long.TryParse(rangeParts[1], out end);
                        }
                        else
                        {
                            end = fileLength - 1;
                        }
                    }
                    else if (rangeParts.Length > 1 && !string.IsNullOrEmpty(rangeParts[1]))
                    {
                        // Suffix range (e.g. bytes=-1024) specifically used by Mac Safari / iOS for moov atom
                        long suffix = 0;
                        if (long.TryParse(rangeParts[1], out suffix))
                        {
                            start = Math.Max(0, fileLength - suffix);
                            end = fileLength - 1;
                        }
                    }

                    if (start >= 0 && end < fileLength && start <= end)
                    {
                        isPartial = true;
                    }
                }
            }

            long contentLength = end - start + 1;

            StringBuilder res = new StringBuilder();
            if (isPartial)
            {
                res.Append("HTTP/1.1 206 Partial Content\r\n");
                res.Append("Content-Range: bytes " + start + "-" + end + "/" + fileLength + "\r\n");
            }
            else
            {
                res.Append("HTTP/1.1 200 OK\r\n");
            }

            res.Append("Content-Type: " + contentType + "\r\n");
            res.Append("Content-Length: " + contentLength + "\r\n");
            res.Append("Accept-Ranges: bytes\r\n");
            res.Append("Access-Control-Allow-Origin: *\r\n");
            res.Append("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS, HEAD\r\n");
            res.Append("Access-Control-Allow-Headers: *\r\n");
            res.Append("Connection: close\r\n\r\n");

            byte[] headerBytes = Encoding.UTF8.GetBytes(res.ToString());
            stream.Write(headerBytes, 0, headerBytes.Length);

            if (headOnly)
            {
                stream.Flush();
                return;
            }

            using (FileStream fs = new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
            {
                if (start > 0)
                {
                    fs.Seek(start, SeekOrigin.Begin);
                }

                byte[] buffer = new byte[64 * 1024];
                long remaining = contentLength;

                while (remaining > 0)
                {
                    int toRead = (int)Math.Min(buffer.Length, remaining);
                    int read = fs.Read(buffer, 0, toRead);
                    if (read <= 0) break;

                    stream.Write(buffer, 0, read);
                    remaining -= read;
                }
            }
            stream.Flush();
        }

        private static void SendError(NetworkStream stream, int statusCode, string statusMsg)
        {
            string body = "<!DOCTYPE html><html><body style='font-family:sans-serif;text-align:center;padding:50px;'><h1>" + statusCode + " " + statusMsg + "</h1></body></html>";
            byte[] bodyBytes = Encoding.UTF8.GetBytes(body);

            string response = "HTTP/1.1 " + statusCode + " " + statusMsg + "\r\n" +
                              "Content-Type: text/html; charset=utf-8\r\n" +
                              "Content-Length: " + bodyBytes.Length + "\r\n" +
                              "Access-Control-Allow-Origin: *\r\n" +
                              "Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS, HEAD\r\n" +
                              "Access-Control-Allow-Headers: *\r\n" +
                              "Connection: close\r\n\r\n";
            byte[] headerBytes = Encoding.UTF8.GetBytes(response);
            try
            {
                stream.Write(headerBytes, 0, headerBytes.Length);
                stream.Write(bodyBytes, 0, bodyBytes.Length);
                stream.Flush();
            }
            catch {}
        }

        private static string GetMimeType(string ext)
        {
            if (string.IsNullOrEmpty(ext)) return "application/octet-stream";
            switch (ext.ToLowerInvariant())
            {
                case ".mp4": return "video/mp4";
                case ".webm": return "video/webm";
                case ".mkv": return "video/x-matroska";
                case ".mov": return "video/quicktime";
                case ".png": return "image/png";
                case ".jpg":
                case ".jpeg": return "image/jpeg";
                case ".gif": return "image/gif";
                case ".webp": return "image/webp";
                case ".svg": return "image/svg+xml";
                case ".bmp": return "image/bmp";
                case ".ico": return "image/x-icon";
                case ".mp3": return "audio/mpeg";
                case ".wav": return "audio/wav";
                case ".ogg": return "audio/ogg";
                case ".pdf": return "application/pdf";
                case ".zip": return "application/zip";
                case ".html": return "text/html; charset=utf-8";
                case ".css": return "text/css";
                case ".js": return "application/javascript";
                case ".json": return "application/json";
                case ".txt": return "text/plain; charset=utf-8";
                default: return "application/octet-stream";
            }
        }

        private static string FormatBytes(long bytes)
        {
            if (bytes < 1024) return bytes + " B";
            double kb = bytes / 1024.0;
            if (kb < 1024) return kb.ToString("0.0") + " KB";
            double mb = kb / 1024.0;
            if (mb < 1024) return mb.ToString("0.0") + " MB";
            double gb = mb / 1024.0;
            return gb.ToString("0.00") + " GB";
        }
    }
}
