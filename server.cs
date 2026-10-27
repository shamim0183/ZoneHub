using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Net.NetworkInformation;
using System.Diagnostics;
using System.Text;
using System.Threading;
using System.Collections.Generic;
using System.Linq;
using System.Web.Script.Serialization;
using System.IO.Compression;

namespace ZoneHub
{
    public class ChatMessage
    {
        public string id { get; set; }
        public string user { get; set; }
        public string userId { get; set; }
        public string text { get; set; }
        public string type { get; set; } // "text", "voice", "image"
        public string audioUrl { get; set; }
        public int duration { get; set; }
        public string imageUrl { get; set; }
        public List<string> mediaUrls { get; set; }
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
        private static object ConfigLock = new object();
        private static Dictionary<string, string> TargetTabByIp = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        private static object TargetTabLock = new object();
        private static Dictionary<string, string> DeviceNameCache = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        private static Dictionary<string, string> DnsCache = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        private static object DnsCacheLock = new object();

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
                foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (nic.OperationalStatus == OperationalStatus.Up &&
                        nic.NetworkInterfaceType != NetworkInterfaceType.Loopback &&
                        !nic.Description.ToLowerInvariant().Contains("virtual") &&
                        !nic.Description.ToLowerInvariant().Contains("pseudo") &&
                        !nic.Name.ToLowerInvariant().Contains("vethernet") &&
                        !nic.Name.ToLowerInvariant().Contains("virtualbox") &&
                        !nic.Name.ToLowerInvariant().Contains("vmware"))
                    {
                        var ipProps = nic.GetIPProperties();
                        bool hasGateway = ipProps.GatewayAddresses.Any(g => g.Address != null && !IPAddress.IsLoopback(g.Address) && g.Address.ToString() != "0.0.0.0");
                        foreach (var ip in ipProps.UnicastAddresses)
                        {
                            if (ip.Address.AddressFamily == AddressFamily.InterNetwork && 
                                !IPAddress.IsLoopback(ip.Address) && 
                                !ip.Address.ToString().StartsWith("169.254"))
                            {
                                if (hasGateway) return ip.Address.ToString();
                            }
                        }
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

        private static string GetConfigFilePath()
        {
            return Path.Combine(RootDirectory, "hub_config.json");
        }

        public static string GetDefaultHubName()
        {
            try
            {
                string uName = Environment.UserName;
                string mName = GetHostName();

                // If user has a named machine (e.g. SHAMIM-PC, OFFICE-LAPTOP), use that
                if (!string.IsNullOrEmpty(mName) && 
                    !mName.StartsWith("DESKTOP-", StringComparison.OrdinalIgnoreCase) && 
                    !mName.StartsWith("LAPTOP-", StringComparison.OrdinalIgnoreCase) &&
                    !mName.StartsWith("WIN-", StringComparison.OrdinalIgnoreCase))
                {
                    return mName + " Media Hub";
                }

                // If user account is clean (e.g. obak3, shamim), use that
                if (!string.IsNullOrEmpty(uName) && 
                    !uName.Equals("user", StringComparison.OrdinalIgnoreCase) &&
                    !uName.Equals("administrator", StringComparison.OrdinalIgnoreCase) &&
                    !uName.Equals("system", StringComparison.OrdinalIgnoreCase))
                {
                    return uName + " Media Hub";
                }

                if (!string.IsNullOrEmpty(mName))
                {
                    return mName + " Media Hub";
                }
            }
            catch {}
            return "ZoneHub";
        }

        public static string GetHubName()
        {
            lock (ConfigLock)
            {
                try
                {
                    string configPath = GetConfigFilePath();
                    if (File.Exists(configPath))
                    {
                        string json = File.ReadAllText(configPath, Encoding.UTF8);
                        JavaScriptSerializer js = new JavaScriptSerializer();
                        var dict = js.Deserialize<Dictionary<string, object>>(json);
                        if (dict != null && dict.ContainsKey("hubName") && dict["hubName"] != null)
                        {
                            string name = dict["hubName"].ToString().Trim();
                            if (!string.IsNullOrEmpty(name)) return name;
                        }
                    }
                }
                catch {}

                return GetDefaultHubName();
            }
        }

        public static string GetAdminPin()
        {
            lock (ConfigLock)
            {
                try
                {
                    string configPath = GetConfigFilePath();
                    if (File.Exists(configPath))
                    {
                        string json = File.ReadAllText(configPath, Encoding.UTF8);
                        JavaScriptSerializer js = new JavaScriptSerializer();
                        var dict = js.Deserialize<Dictionary<string, object>>(json);
                        if (dict != null && dict.ContainsKey("adminPin") && dict["adminPin"] != null)
                        {
                            string pin = dict["adminPin"].ToString().Trim();
                            if (!string.IsNullOrEmpty(pin)) return pin;
                        }
                    }
                }
                catch {}
                return "1234";
            }
        }

        public static void SetAdminPin(string newPin)
        {
            lock (ConfigLock)
            {
                try
                {
                    string configPath = GetConfigFilePath();
                    JavaScriptSerializer js = new JavaScriptSerializer();
                    Dictionary<string, object> dict = new Dictionary<string, object>();
                    if (File.Exists(configPath))
                    {
                        try
                        {
                            string json = File.ReadAllText(configPath, Encoding.UTF8);
                            dict = js.Deserialize<Dictionary<string, object>>(json) ?? new Dictionary<string, object>();
                        }
                        catch {}
                    }
                    dict["adminPin"] = newPin.Trim();
                    dict["updatedAt"] = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
                    File.WriteAllText(configPath, js.Serialize(dict), Encoding.UTF8);
                }
                catch {}
            }
        }

        public static bool IsAdmin(RequestContext req)
        {
            if (req.IsLocalhost) return true;

            string pin = "";
            if (req.Headers.ContainsKey("x-admin-token")) pin = req.Headers["x-admin-token"].Trim();
            else if (req.Headers.ContainsKey("x-admin-pin")) pin = req.Headers["x-admin-pin"].Trim();

            if (string.IsNullOrEmpty(pin) && req.Url.IndexOf("pin=", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                int pIdx = req.Url.IndexOf("pin=", StringComparison.OrdinalIgnoreCase);
                string pSub = req.Url.Substring(pIdx + 4);
                int amp = pSub.IndexOf('&');
                if (amp >= 0) pSub = pSub.Substring(0, amp);
                pin = Uri.UnescapeDataString(pSub).Trim();
            }

            if (!string.IsNullOrEmpty(pin))
            {
                return string.Equals(pin, GetAdminPin(), StringComparison.Ordinal);
            }
            return false;
        }

        public static void SetHubName(string newName)
        {
            lock (ConfigLock)
            {
                try
                {
                    string configPath = GetConfigFilePath();
                    JavaScriptSerializer js = new JavaScriptSerializer();
                    Dictionary<string, object> dict = new Dictionary<string, object>();
                    if (File.Exists(configPath))
                    {
                        try
                        {
                            string json = File.ReadAllText(configPath, Encoding.UTF8);
                            dict = js.Deserialize<Dictionary<string, object>>(json) ?? new Dictionary<string, object>();
                        }
                        catch {}
                    }
                    dict["hubName"] = newName.Trim();
                    dict["machineName"] = GetHostName();
                    dict["updatedAt"] = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
                    File.WriteAllText(configPath, js.Serialize(dict), Encoding.UTF8);
                }
                catch {}
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
                    if (url.StartsWith("https://") || url.StartsWith("http://"))
                    {
                        if (url.Contains(".trycloudflare.com"))
                        {
                            bool cfRunning = false;
                            try { cfRunning = Process.GetProcessesByName("cloudflared").Length > 0; } catch {}
                            if (cfRunning) return url;
                        }
                        else
                        {
                            // Permanent custom domain (e.g. hub.company.com)
                            return url;
                        }
                    }
                }

                bool isTunnelRunning = false;
                try { isTunnelRunning = Process.GetProcessesByName("cloudflared").Length > 0; } catch {}

                if (isTunnelRunning)
                {
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
            }
            catch {}
            return null;
        }

        private static void StartDiscoveryResponder()
        {
            Thread t = new Thread(() =>
            {
                try
                {
                    using (UdpClient udp = new UdpClient(8089))
                    {
                        udp.EnableBroadcast = true;
                        while (true)
                        {
                            IPEndPoint ep = new IPEndPoint(IPAddress.Any, 0);
                            byte[] req = udp.Receive(ref ep);
                            if (req == null || req.Length == 0) continue;
                            string msg = Encoding.UTF8.GetString(req);
                            if (msg.StartsWith("ZONEHUB_DISCOVERY", StringComparison.OrdinalIgnoreCase))
                            {
                                string ip = GetCurrentLocalIp();
                                string resp = "ZONEHUB_OFFER|http://" + ip + ":" + Port + "|" + GetHubName();
                                byte[] respBytes = Encoding.UTF8.GetBytes(resp);
                                udp.Send(respBytes, respBytes.Length, ep);
                            }
                        }
                    }
                }
                catch {}
            });
            t.IsBackground = true;
            t.Start();
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
                if (ex.Message.Contains("Only one usage of each socket address"))
                {
                    Console.ForegroundColor = ConsoleColor.Yellow;
                    Console.WriteLine("[INFO] ZoneHub server is ALREADY RUNNING on port " + Port + "!");
                    Console.ResetColor();
                }
                if (Environment.UserInteractive && !Console.IsInputRedirected)
                {
                    Console.WriteLine("Press any key to exit...");
                    try { Console.ReadKey(); } catch {}
                }
                return;
            }

            StartDiscoveryResponder();

            string currentIp = GetCurrentLocalIp();
            string pcName = GetHostName();
            string hubName = GetHubName();

            try { Console.Title = hubName + " & Team Chat - Port " + Port; } catch {}
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("==================================================================");
            Console.WriteLine("  🚀 " + hubName + " & Advanced Team Chat is ONLINE");
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

                // Normalize redundant leading slashes (e.g. "//", "///" -> "/")
                while (decodedPath.StartsWith("//"))
                {
                    decodedPath = decodedPath.Substring(1);
                }
                if (string.IsNullOrEmpty(decodedPath)) decodedPath = "/";

                // Handle GET / HEAD dashboard
                if ((req.Method == "GET" || req.Method == "HEAD") && (decodedPath == "/" || decodedPath.Equals("/index.html", StringComparison.OrdinalIgnoreCase)))
                {
                    ServeDashboard(stream, req.Method == "HEAD");
                    return;
                }

                // Handle GET manifest.json (dynamic hubName)
                if ((req.Method == "GET" || req.Method == "HEAD") && decodedPath.Equals("/manifest.json", StringComparison.OrdinalIgnoreCase))
                {
                    ServeManifest(stream, req.Method == "HEAD");
                    return;
                }

                // Handle GET my-info (PC default name)
                if (req.Method == "GET" && decodedPath.Equals("/api/my-info", StringComparison.OrdinalIgnoreCase))
                {
                    ServeMyInfo(stream, req);
                    return;
                }

                // Handle GET / POST target-tab (Desktop Bubble signal to switch tabs)
                if (decodedPath.Equals("/api/target-tab", StringComparison.OrdinalIgnoreCase))
                {
                    HandleTargetTab(stream, req);
                    return;
                }

                // Handle GET / POST register-device (Desktop Bubble registers actual Windows PC name)
                if (decodedPath.Equals("/api/register-device", StringComparison.OrdinalIgnoreCase))
                {
                    string devName = "";
                    if (req.Url.Contains("name="))
                    {
                        int nIdx = req.Url.IndexOf("name=") + 5;
                        int nEnd = req.Url.IndexOf('&', nIdx);
                        string rawName = (nEnd == -1) ? req.Url.Substring(nIdx) : req.Url.Substring(nIdx, nEnd - nIdx);
                        devName = Uri.UnescapeDataString(rawName).Trim();
                    }
                    if (!string.IsNullOrEmpty(devName) && !string.IsNullOrEmpty(req.ClientIp))
                    {
                        lock (DeviceNameCache)
                        {
                            DeviceNameCache[req.ClientIp] = devName;
                        }
                    }
                    SendJsonResponse(stream, 200, "{\"success\":true}");
                    return;
                }

                // Admin Status & Login Endpoints
                if (decodedPath.Equals("/api/admin/status", StringComparison.OrdinalIgnoreCase))
                {
                    bool isAdm = IsAdmin(req);
                    SendJsonResponse(stream, 200, "{\"success\":true,\"isAdmin\":" + (isAdm ? "true" : "false") + ",\"isHost\":" + (req.IsLocalhost ? "true" : "false") + "}");
                    return;
                }

                if (req.Method == "POST" && decodedPath.Equals("/api/admin/login", StringComparison.OrdinalIgnoreCase))
                {
                    HandleAdminLogin(stream, req);
                    return;
                }

                if (req.Method == "POST" && decodedPath.Equals("/api/admin/change-pin", StringComparison.OrdinalIgnoreCase))
                {
                    HandleAdminChangePin(stream, req);
                    return;
                }

                // Handle GET / POST config (Dynamic Hub Name)
                if (decodedPath.Equals("/api/config", StringComparison.OrdinalIgnoreCase))
                {
                    if (req.Method == "GET")
                    {
                        string curHub = GetHubName();
                        string defHub = GetDefaultHubName();
                        string mName = GetHostName();
                        string uName = Environment.UserName;
                        string json = "{" +
                            "\"hubName\":\"" + JsonEscape(curHub) + "\"," +
                            "\"defaultHubName\":\"" + JsonEscape(defHub) + "\"," +
                            "\"machineName\":\"" + JsonEscape(mName) + "\"," +
                            "\"userName\":\"" + JsonEscape(uName) + "\"," +
                            "\"machineHubName\":\"" + JsonEscape(mName + " Media Hub") + "\"," +
                            "\"userHubName\":\"" + JsonEscape(uName + " Media Hub") + "\"" +
                        "}";
                        SendJsonResponse(stream, 200, json);
                        return;
                    }
                    if (req.Method == "POST")
                    {
                        HandleSaveConfig(stream, req);
                        return;
                    }
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

                // Handle POST delete folder API
                if (req.Method == "POST" && decodedPath.Equals("/api/folders/delete", StringComparison.OrdinalIgnoreCase))
                {
                    HandleDeleteFolder(stream, req);
                    return;
                }

                // Handle POST delete file API
                if (req.Method == "POST" && decodedPath.Equals("/api/files/delete", StringComparison.OrdinalIgnoreCase))
                {
                    HandleDeleteFile(stream, req);
                    return;
                }

                // Handle POST file upload
                if (req.Method == "POST" && decodedPath.Equals("/upload", StringComparison.OrdinalIgnoreCase))
                {
                    HandleUpload(stream, req);
                    return;
                }

                // Handle ZIP download API (GET /api/download-zip?folder=... or POST /api/download-zip)
                if (decodedPath.Equals("/api/download-zip", StringComparison.OrdinalIgnoreCase))
                {
                    HandleDownloadZip(stream, req);
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

            // Check proxy headers (Cloudflare, reverse proxies) to properly detect remote employees
            if (ctx.Headers.ContainsKey("cf-connecting-ip"))
            {
                ctx.ClientIp = ctx.Headers["cf-connecting-ip"].Trim();
                ctx.IsLocalhost = false;
            }
            else if (ctx.Headers.ContainsKey("x-forwarded-for"))
            {
                string fwd = ctx.Headers["x-forwarded-for"];
                if (!string.IsNullOrEmpty(fwd))
                {
                    ctx.ClientIp = fwd.Split(',')[0].Trim();
                    ctx.IsLocalhost = false;
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

        #region My Info & UI Signals
        private static void ServeMyInfo(NetworkStream stream, RequestContext req)
        {
            string defaultName = "";
            bool isHost = req.IsLocalhost;
            if (isHost)
            {
                defaultName = Environment.UserName;
            }
            else if (!string.IsNullOrEmpty(req.ClientIp))
            {
                lock (DeviceNameCache)
                {
                    if (DeviceNameCache.ContainsKey(req.ClientIp))
                    {
                        defaultName = DeviceNameCache[req.ClientIp];
                    }
                }

                if (string.IsNullOrEmpty(defaultName))
                {
                    lock (DnsCacheLock)
                    {
                        if (DnsCache.ContainsKey(req.ClientIp))
                        {
                            defaultName = DnsCache[req.ClientIp];
                        }
                    }
                }

                if (string.IsNullOrEmpty(defaultName))
                {
                    string ipTail = req.ClientIp.Replace(".", "_").Replace(":", "_");
                    string shortNum = (ipTail.Length > 3 ? ipTail.Substring(ipTail.Length - 3) : "PC");
                    defaultName = "Employee_" + shortNum;

                    // Background DNS resolution without blocking HTTP client
                    string resolveIp = req.ClientIp;
                    ThreadPool.QueueUserWorkItem(state =>
                    {
                        try
                        {
                            IPAddress ip;
                            if (IPAddress.TryParse(resolveIp, out ip))
                            {
                                var entry = Dns.GetHostEntry(ip);
                                if (entry != null && !string.IsNullOrEmpty(entry.HostName))
                                {
                                    string hostNameOnly = entry.HostName.Split('.')[0];
                                    lock (DnsCacheLock)
                                    {
                                        DnsCache[resolveIp] = hostNameOnly;
                                    }
                                }
                            }
                        }
                        catch {}
                    });
                }
            }
            else
            {
                defaultName = "Employee";
            }

            JavaScriptSerializer js = new JavaScriptSerializer();
            var dict = new Dictionary<string, object>();
            dict["defaultName"] = defaultName;
            dict["clientIp"] = req.ClientIp;
            dict["isHost"] = isHost;
            dict["isAdmin"] = IsAdmin(req);

            SendJsonResponse(stream, 200, js.Serialize(dict));
        }

        private static void HandleTargetTab(NetworkStream stream, RequestContext req)
        {
            string setVal = "";
            if (req.Url.Contains("set="))
            {
                try
                {
                    setVal = req.Url.Split(new[] { "set=" }, StringSplitOptions.None)[1].Split('&')[0];
                }
                catch {}
            }

            string clientKey = req.ClientIp;
            if (string.IsNullOrEmpty(clientKey) || req.IsLocalhost) clientKey = "localhost";

            lock (TargetTabLock)
            {
                if (!string.IsNullOrEmpty(setVal))
                {
                    TargetTabByIp[clientKey] = setVal;
                    if (clientKey == "localhost")
                    {
                        TargetTabByIp["127.0.0.1"] = setVal;
                        TargetTabByIp["::1"] = setVal;
                    }
                    SendJsonResponse(stream, 200, "{\"success\":true,\"targetTab\":\"" + JsonEscape(setVal) + "\"}");
                    return;
                }

                string current = "";
                if (TargetTabByIp.ContainsKey(clientKey))
                {
                    current = TargetTabByIp[clientKey];
                    TargetTabByIp.Remove(clientKey);
                }
                else if (req.IsLocalhost && TargetTabByIp.ContainsKey("localhost"))
                {
                    current = TargetTabByIp["localhost"];
                    TargetTabByIp.Remove("localhost");
                }

                SendJsonResponse(stream, 200, "{\"targetTab\":\"" + JsonEscape(current) + "\"}");
            }
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

            if (input == null || (string.IsNullOrWhiteSpace(input.text) && string.IsNullOrEmpty(input.audioUrl) && string.IsNullOrEmpty(input.imageUrl) && (input.mediaUrls == null || input.mediaUrls.Count == 0)))
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
            newMsg.duration = input.duration;
            newMsg.imageUrl = input.imageUrl;

            if (input.mediaUrls != null && input.mediaUrls.Count > 0)
            {
                newMsg.mediaUrls = input.mediaUrls;
            }
            else if (!string.IsNullOrEmpty(input.imageUrl))
            {
                newMsg.mediaUrls = new List<string>(input.imageUrl.Split(new char[] { '|' }, StringSplitOptions.RemoveEmptyEntries));
            }
            else
            {
                newMsg.mediaUrls = new List<string>();
            }

            if (newMsg.mediaUrls.Count > 1)
            {
                newMsg.type = "media_group";
                if (string.IsNullOrEmpty(newMsg.imageUrl))
                {
                    newMsg.imageUrl = string.Join("|", newMsg.mediaUrls.ToArray());
                }
            }

            newMsg.timestamp = DateTime.Now.ToString("hh:mm tt, MMM dd");
            newMsg.edited = false;
            newMsg.deleted = false;
            newMsg.reactions = new Dictionary<string, List<string>>();

            lock (MessagesLock)
            {
                var list = LoadMessages();
                list.Add(newMsg);
                SaveMessages(list);
            }

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

            lock (MessagesLock)
            {
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

            lock (MessagesLock)
            {
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

            lock (MessagesLock)
            {
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
                    target.mediaUrls = new List<string>();
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
            if (ext == ".exe" || ext == ".cs" || ext == ".bat" || ext == ".cmd" || ext == ".ps1" || ext == ".vbs" || ext == ".pdb" || ext == ".log") return false;
            string name = f.Name;
            if (name.Equals("index.html", StringComparison.OrdinalIgnoreCase) ||
                name.Equals("manifest.json", StringComparison.OrdinalIgnoreCase) ||
                name.Equals("sw.js", StringComparison.OrdinalIgnoreCase) ||
                name.Equals("hub_config.json", StringComparison.OrdinalIgnoreCase) ||
                name.Equals("online_url.txt", StringComparison.OrdinalIgnoreCase) ||
                name.Equals("cloudflared.log", StringComparison.OrdinalIgnoreCase) ||
                name.Equals("messages.json", StringComparison.OrdinalIgnoreCase) ||
                name.Equals("file_metadata.json", StringComparison.OrdinalIgnoreCase) ||
                name.Equals("favicon.svg", StringComparison.OrdinalIgnoreCase) ||
                name.Equals("favicon.png", StringComparison.OrdinalIgnoreCase) ||
                name.Equals("favicon.ico", StringComparison.OrdinalIgnoreCase) ||
                name.Equals("server.pdb", StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }
            if (f.FullName.IndexOf(Path.DirectorySeparatorChar + "css" + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) >= 0 ||
                f.FullName.IndexOf(Path.DirectorySeparatorChar + "js" + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) >= 0)
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
                    if (dInfo.Attributes.HasFlag(FileAttributes.Hidden) || 
                        dInfo.Name.StartsWith(".") || 
                        dInfo.Name.Equals("bin", StringComparison.OrdinalIgnoreCase) ||
                        dInfo.Name.Equals("css", StringComparison.OrdinalIgnoreCase) ||
                        dInfo.Name.Equals("js", StringComparison.OrdinalIgnoreCase)) continue;
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
                if (req.IsLocalhost)
                {
                    uploader = Environment.UserName;
                }
                else if (!string.IsNullOrEmpty(req.ClientIp))
                {
                    lock (DeviceNameCache)
                    {
                        if (DeviceNameCache.ContainsKey(req.ClientIp))
                        {
                            uploader = DeviceNameCache[req.ClientIp];
                        }
                    }
                    if (string.IsNullOrEmpty(uploader))
                    {
                        lock (DnsCacheLock)
                        {
                            if (DnsCache.ContainsKey(req.ClientIp))
                            {
                                uploader = DnsCache[req.ClientIp];
                            }
                        }
                    }
                }
            }
            if (string.IsNullOrEmpty(uploader))
            {
                uploader = req.IsLocalhost ? Environment.UserName : "Employee";
            }

            int extractedCount = 0;
            bool autoExtract = safeName.EndsWith(".zip", StringComparison.OrdinalIgnoreCase) && 
                               (req.Headers.ContainsKey("x-auto-extract") || req.Url.IndexOf("extract=true", StringComparison.OrdinalIgnoreCase) >= 0);
            if (autoExtract)
            {
                try
                {
                    using (ZipArchive zip = ZipFile.OpenRead(targetPath))
                    {
                        foreach (var entry in zip.Entries)
                        {
                            if (string.IsNullOrEmpty(entry.Name)) continue;
                            string destFile = Path.Combine(targetDir, entry.Name);
                            if (!Path.GetFullPath(destFile).StartsWith(targetDir, StringComparison.OrdinalIgnoreCase)) continue;
                            entry.ExtractToFile(destFile, true);
                            extractedCount++;

                            try
                            {
                                lock (MetadataLock)
                                {
                                    var metaDict = LoadFileMetadata();
                                    var metaItem = new FileMetaItem {
                                        uploader = uploader,
                                        uploadedAt = DateTime.Now.ToString("MMM dd, yyyy - hh:mm tt")
                                    };
                                    string destRel = string.IsNullOrEmpty(targetSubFolder) ? entry.Name : (targetSubFolder + "/" + entry.Name);
                                    metaDict[entry.Name] = metaItem;
                                    metaDict[destRel] = metaItem;
                                    SaveFileMetadata(metaDict);
                                }
                            }
                            catch {}
                        }
                    }
                    Console.WriteLine("[ZIP AUTO-EXTRACT] Extracted " + extractedCount + " files to " + targetSubFolder);
                }
                catch (Exception ex)
                {
                    Console.WriteLine("[ZIP EXTRACT ERROR] " + ex.Message);
                }
            }

            string relPath = string.IsNullOrEmpty(targetSubFolder) ? safeName : (targetSubFolder + "/" + safeName);

            lock (MetadataLock)
            {
                var metaDict = LoadFileMetadata();
                var metaItem = new FileMetaItem {
                    uploader = uploader,
                    uploadedAt = DateTime.Now.ToString("MMM dd, yyyy - hh:mm tt")
                };
                metaDict[safeName] = metaItem;
                metaDict[relPath] = metaItem;
                SaveFileMetadata(metaDict);
            }

            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine("[UPLOAD COMPLETED] " + relPath + " (" + FormatBytes(totalWritten) + ") from " + uploader);
            Console.ResetColor();

            string json = "{\"success\":true,\"filename\":\"" + JsonEscape(safeName) + "\",\"relativePath\":\"" + JsonEscape(relPath) + "\",\"folder\":\"" + JsonEscape(targetSubFolder) + "\",\"size\":" + totalWritten + ",\"extractedCount\":" + extractedCount + "}";
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

        private static void HandleDeleteFolder(NetworkStream stream, RequestContext req)
        {
            if (!IsAdmin(req))
            {
                SendJsonResponse(stream, 403, "{\"success\":false,\"error\":\"Admin permission required to delete folders.\"}");
                return;
            }

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
            string[] protectedFolders = new string[] { "Videos", "Pictures", "Chat_Media", "Documents", "bin", "obj", "css", "js", ".git" };
            foreach (var p in protectedFolders)
            {
                if (safeFolderName.Equals(p, StringComparison.OrdinalIgnoreCase))
                {
                    SendJsonResponse(stream, 400, "{\"success\":false,\"error\":\"System folder '" + p + "' cannot be deleted.\"}");
                    return;
                }
            }

            string targetDir = Path.Combine(RootDirectory, safeFolderName);
            if (!Directory.Exists(targetDir))
            {
                SendJsonResponse(stream, 404, "{\"success\":false,\"error\":\"Folder '" + JsonEscape(safeFolderName) + "' not found.\"}");
                return;
            }

            try
            {
                Directory.Delete(targetDir, true);
                Console.ForegroundColor = ConsoleColor.Yellow;
                Console.WriteLine("[FOLDER DELETED] " + safeFolderName + " by Admin");
                Console.ResetColor();

                try
                {
                    var meta = LoadFileMetadata();
                    var keysToRemove = new List<string>();
                    foreach (var kvp in meta)
                    {
                        if (kvp.Key.StartsWith(safeFolderName + "/", StringComparison.OrdinalIgnoreCase) ||
                            kvp.Key.StartsWith(safeFolderName + "\\", StringComparison.OrdinalIgnoreCase))
                        {
                            keysToRemove.Add(kvp.Key);
                        }
                    }
                    if (keysToRemove.Count > 0)
                    {
                        foreach (var k in keysToRemove) meta.Remove(k);
                        SaveFileMetadata(meta);
                    }
                }
                catch {}

                SendJsonResponse(stream, 200, "{\"success\":true,\"name\":\"" + JsonEscape(safeFolderName) + "\"}");
            }
            catch (Exception ex)
            {
                SendJsonResponse(stream, 500, "{\"success\":false,\"error\":\"" + JsonEscape(ex.Message) + "\"}");
            }
        }

        private static void HandleDeleteFile(NetworkStream stream, RequestContext req)
        {
            string targetPath = "";
            int qIndex = req.Url.IndexOf("?path=");
            if (qIndex >= 0)
            {
                targetPath = Uri.UnescapeDataString(req.Url.Substring(qIndex + 6));
                int amp = targetPath.IndexOf('&');
                if (amp >= 0) targetPath = targetPath.Substring(0, amp);
            }

            string userName = "";
            if (req.Headers.ContainsKey("x-uploader"))
            {
                userName = Uri.UnescapeDataString(req.Headers["x-uploader"]).Trim();
            }

            if (string.IsNullOrEmpty(targetPath))
            {
                string body = ReadBodyString(stream, req);
                if (!string.IsNullOrEmpty(body))
                {
                    try
                    {
                        JavaScriptSerializer js = new JavaScriptSerializer();
                        var dict = js.Deserialize<Dictionary<string, object>>(body);
                        if (dict != null)
                        {
                            if (dict.ContainsKey("path") && dict["path"] != null) targetPath = dict["path"].ToString();
                            if (dict.ContainsKey("user") && dict["user"] != null && string.IsNullOrEmpty(userName)) userName = dict["user"].ToString();
                        }
                    }
                    catch {}
                }
            }

            targetPath = (targetPath ?? "").Trim().TrimStart('/', '\\');
            if (string.IsNullOrEmpty(targetPath))
            {
                SendJsonResponse(stream, 400, "{\"success\":false,\"error\":\"File path is required\"}");
                return;
            }

            if (targetPath.Contains(".."))
            {
                SendJsonResponse(stream, 400, "{\"success\":false,\"error\":\"Invalid file path\"}");
                return;
            }

            string fullPath = Path.Combine(RootDirectory, targetPath.Replace('/', Path.DirectorySeparatorChar));
            if (!File.Exists(fullPath))
            {
                SendJsonResponse(stream, 404, "{\"success\":false,\"error\":\"File not found\"}");
                return;
            }

            bool isAdmin = IsAdmin(req);
            if (!isAdmin)
            {
                var meta = LoadFileMetadata();
                string uploader = "";
                string normKey = targetPath.Replace('\\', '/');
                if (meta.ContainsKey(normKey)) uploader = meta[normKey].uploader ?? "";
                else if (meta.ContainsKey(Path.GetFileName(targetPath))) uploader = meta[Path.GetFileName(targetPath)].uploader ?? "";

                if (string.IsNullOrEmpty(uploader) || !string.Equals(uploader, userName, StringComparison.OrdinalIgnoreCase))
                {
                    SendJsonResponse(stream, 403, "{\"success\":false,\"error\":\"Only Admin or the original uploader can delete this file.\"}");
                    return;
                }
            }

            try
            {
                File.Delete(fullPath);
                Console.ForegroundColor = ConsoleColor.Yellow;
                Console.WriteLine("[FILE DELETED] " + targetPath + (isAdmin ? " by Admin" : " by " + userName));
                Console.ResetColor();

                try
                {
                    var meta = LoadFileMetadata();
                    string normKey = targetPath.Replace('\\', '/');
                    string fileNameOnly = Path.GetFileName(targetPath);
                    if (meta.ContainsKey(normKey)) meta.Remove(normKey);
                    if (meta.ContainsKey(fileNameOnly)) meta.Remove(fileNameOnly);
                    SaveFileMetadata(meta);
                }
                catch {}

                SendJsonResponse(stream, 200, "{\"success\":true,\"path\":\"" + JsonEscape(targetPath) + "\"}");
            }
            catch (Exception ex)
            {
                SendJsonResponse(stream, 500, "{\"success\":false,\"error\":\"" + JsonEscape(ex.Message) + "\"}");
            }
        }

        private static void HandleDownloadZip(NetworkStream stream, RequestContext req)
        {
            List<string> filePaths = new List<string>();
            string zipName = "ZoneHub_Files.zip";

            if (req.Method == "GET")
            {
                string folder = "";
                int qIdx = req.Url.IndexOf("?folder=");
                if (qIdx >= 0)
                {
                    folder = Uri.UnescapeDataString(req.Url.Substring(qIdx + 8));
                    int amp = folder.IndexOf('&');
                    if (amp >= 0) folder = folder.Substring(0, amp);
                }

                folder = folder != null ? folder.Trim() : "";
                if (!string.IsNullOrEmpty(folder) && !folder.Equals("all", StringComparison.OrdinalIgnoreCase))
                {
                    string safeFolder = Path.GetFileName(folder);
                    string targetDir = Path.Combine(RootDirectory, safeFolder);
                    if (Directory.Exists(targetDir))
                    {
                        var di = new DirectoryInfo(targetDir);
                        foreach (var fi in di.GetFiles("*", SearchOption.AllDirectories))
                        {
                            if (IsValidSharedFile(fi)) filePaths.Add(fi.FullName);
                        }
                        zipName = safeFolder + ".zip";
                    }
                }
                else
                {
                    var rootDi = new DirectoryInfo(RootDirectory);
                    foreach (var fi in rootDi.GetFiles())
                    {
                        if (IsValidSharedFile(fi)) filePaths.Add(fi.FullName);
                    }
                    foreach (var dir in rootDi.GetDirectories())
                    {
                        if (dir.Attributes.HasFlag(FileAttributes.Hidden) || 
                            dir.Name.StartsWith(".") || 
                            dir.Name.Equals("bin", StringComparison.OrdinalIgnoreCase) ||
                            dir.Name.Equals("obj", StringComparison.OrdinalIgnoreCase) ||
                            dir.Name.Equals("css", StringComparison.OrdinalIgnoreCase) ||
                            dir.Name.Equals("js", StringComparison.OrdinalIgnoreCase)) continue;
                        try
                        {
                            foreach (var fi in dir.GetFiles("*", SearchOption.AllDirectories))
                            {
                                if (IsValidSharedFile(fi)) filePaths.Add(fi.FullName);
                            }
                        }
                        catch {}
                    }
                    zipName = GetHubName() + "_All_Files.zip";
                }
            }
            else if (req.Method == "POST")
            {
                string body = ReadBodyString(stream, req);
                try
                {
                    JavaScriptSerializer js = new JavaScriptSerializer();
                    var dict = js.Deserialize<Dictionary<string, object>>(body);
                    if (dict != null)
                    {
                        if (dict.ContainsKey("zipName") && dict["zipName"] != null)
                        {
                            zipName = dict["zipName"].ToString();
                        }
                        if (dict.ContainsKey("files") && dict["files"] is System.Collections.IEnumerable && !(dict["files"] is string))
                        {
                            var list = (System.Collections.IEnumerable)dict["files"];
                            foreach (var item in list)
                            {
                                string rawItem = item != null ? item.ToString() : "";
                                int q = rawItem.IndexOf('?');
                                if (q >= 0) rawItem = rawItem.Substring(0, q);
                                string rel = Uri.UnescapeDataString(rawItem).TrimStart('/', '\\').Replace('/', Path.DirectorySeparatorChar);
                                string full = Path.GetFullPath(Path.Combine(RootDirectory, rel));
                                if (File.Exists(full) && full.StartsWith(RootDirectory, StringComparison.OrdinalIgnoreCase))
                                {
                                    filePaths.Add(full);
                                }
                                else
                                {
                                    string fn = Path.GetFileName(rel);
                                    string found = FindFileInSubfolders(RootDirectory, fn);
                                    if (found != null && File.Exists(found)) filePaths.Add(found);
                                }
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine("[ZIP PARSE ERROR] " + ex.Message);
                }
            }

            if (filePaths.Count == 0)
            {
                SendError(stream, 404, "No downloadable files found");
                return;
            }

            foreach (char c in Path.GetInvalidFileNameChars())
            {
                zipName = zipName.Replace(c, '_');
            }
            if (!zipName.EndsWith(".zip", StringComparison.OrdinalIgnoreCase)) zipName += ".zip";

            string tempZipPath = Path.Combine(Path.GetTempPath(), "zh_" + Guid.NewGuid().ToString("N") + ".zip");
            try
            {
                using (FileStream fs = new FileStream(tempZipPath, FileMode.Create, FileAccess.ReadWrite, FileShare.None))
                {
                    using (ZipArchive archive = new ZipArchive(fs, ZipArchiveMode.Create))
                    {
                        HashSet<string> usedEntryNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                        foreach (var fp in filePaths)
                        {
                            try
                            {
                                if (!File.Exists(fp)) continue;
                                string entryName = Path.GetFileName(fp);
                                if (usedEntryNames.Contains(entryName))
                                {
                                    entryName = Path.GetFileNameWithoutExtension(fp) + "_" + Guid.NewGuid().ToString("N").Substring(0, 4) + Path.GetExtension(fp);
                                }
                                usedEntryNames.Add(entryName);

                                var entry = archive.CreateEntry(entryName, CompressionLevel.NoCompression);
                                using (var entryStream = entry.Open())
                                using (var fileStream = new FileStream(fp, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                                {
                                    byte[] buf = new byte[64 * 1024];
                                    int read;
                                    while ((read = fileStream.Read(buf, 0, buf.Length)) > 0)
                                    {
                                        entryStream.Write(buf, 0, read);
                                    }
                                }
                            }
                            catch {}
                        }
                    }
                }

                FileInfo zipFi = new FileInfo(tempZipPath);
                long zipLength = zipFi.Length;

                StringBuilder header = new StringBuilder();
                header.Append("HTTP/1.1 200 OK\r\n");
                header.Append("Content-Type: application/zip\r\n");
                header.Append("Content-Disposition: attachment; filename=\"" + zipName + "\"\r\n");
                header.Append("Content-Length: " + zipLength + "\r\n");
                header.Append("Access-Control-Allow-Origin: *\r\n");
                header.Append("Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n");
                header.Append("Access-Control-Allow-Headers: *\r\n");
                header.Append("Cache-Control: no-cache, no-store, must-revalidate\r\n");
                header.Append("Connection: close\r\n\r\n");

                byte[] hBytes = Encoding.UTF8.GetBytes(header.ToString());
                stream.Write(hBytes, 0, hBytes.Length);

                using (FileStream rfs = new FileStream(tempZipPath, FileMode.Open, FileAccess.Read, FileShare.Read))
                {
                    byte[] buf = new byte[64 * 1024];
                    int r;
                    while ((r = rfs.Read(buf, 0, buf.Length)) > 0)
                    {
                        stream.Write(buf, 0, r);
                    }
                }
                stream.Flush();
                Console.WriteLine("[ZIP DOWNLOAD] Streamed " + zipName + " (" + FormatBytes(zipLength) + ") with " + filePaths.Count + " files");
            }
            catch (Exception ex)
            {
                Console.WriteLine("[ZIP ERROR] " + ex.Message);
            }
            finally
            {
                try
                {
                    if (File.Exists(tempZipPath)) File.Delete(tempZipPath);
                }
                catch {}
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
                            !d.Name.Equals("obj", StringComparison.OrdinalIgnoreCase) &&
                            !d.Name.Equals("css", StringComparison.OrdinalIgnoreCase) &&
                            !d.Name.Equals("js", StringComparison.OrdinalIgnoreCase))
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

                bool isSystem = d.Name.Equals("Videos", StringComparison.OrdinalIgnoreCase) ||
                                d.Name.Equals("Pictures", StringComparison.OrdinalIgnoreCase) ||
                                d.Name.Equals("Chat_Media", StringComparison.OrdinalIgnoreCase) ||
                                d.Name.Equals("Documents", StringComparison.OrdinalIgnoreCase);

                sb.Append("{");
                sb.Append("\"id\":\"" + JsonEscape(d.Name) + "\",");
                sb.Append("\"name\":\"" + JsonEscape(d.Name) + "\",");
                sb.Append("\"displayName\":\"" + JsonEscape(displayName) + "\",");
                sb.Append("\"isSystem\":" + (isSystem ? "true" : "false") + ",");
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
                        dir.Name.Equals("obj", StringComparison.OrdinalIgnoreCase) ||
                        dir.Name.Equals("css", StringComparison.OrdinalIgnoreCase) ||
                        dir.Name.Equals("js", StringComparison.OrdinalIgnoreCase))
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

        private static void HandleAdminLogin(NetworkStream stream, RequestContext req)
        {
            string pin = "";
            int qIdx = req.Url.IndexOf("?pin=");
            if (qIdx >= 0)
            {
                pin = Uri.UnescapeDataString(req.Url.Substring(qIdx + 5));
                int amp = pin.IndexOf('&');
                if (amp >= 0) pin = pin.Substring(0, amp);
            }

            if (string.IsNullOrEmpty(pin))
            {
                string body = ReadBodyString(stream, req);
                try
                {
                    JavaScriptSerializer js = new JavaScriptSerializer();
                    var d = js.Deserialize<Dictionary<string, object>>(body);
                    if (d != null && d.ContainsKey("pin") && d["pin"] != null) pin = d["pin"].ToString().Trim();
                }
                catch {}
                if (string.IsNullOrEmpty(pin) && !string.IsNullOrEmpty(body))
                {
                    pin = body.Trim().Trim('"', '\'');
                }
            }

            if (!string.IsNullOrEmpty(pin) && string.Equals(pin, GetAdminPin(), StringComparison.Ordinal))
            {
                Console.ForegroundColor = ConsoleColor.Green;
                Console.WriteLine("[ADMIN LOGIN] Admin authenticated from " + req.ClientIp);
                Console.ResetColor();
                SendJsonResponse(stream, 200, "{\"success\":true,\"isAdmin\":true,\"token\":\"" + JsonEscape(pin) + "\"}");
            }
            else
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("[ADMIN FAILED] Invalid PIN attempt from " + req.ClientIp);
                Console.ResetColor();
                SendJsonResponse(stream, 401, "{\"success\":false,\"error\":\"Invalid Admin PIN. Please check and try again.\"}");
            }
        }

        private static void HandleAdminChangePin(NetworkStream stream, RequestContext req)
        {
            if (!IsAdmin(req))
            {
                SendJsonResponse(stream, 403, "{\"success\":false,\"error\":\"Admin permission required to change PIN.\"}");
                return;
            }

            string body = ReadBodyString(stream, req);
            string newPin = "";
            try
            {
                JavaScriptSerializer js = new JavaScriptSerializer();
                var d = js.Deserialize<Dictionary<string, object>>(body);
                if (d != null && d.ContainsKey("newPin") && d["newPin"] != null) newPin = d["newPin"].ToString().Trim();
            }
            catch {}

            if (string.IsNullOrEmpty(newPin) || newPin.Length < 4)
            {
                SendJsonResponse(stream, 400, "{\"success\":false,\"error\":\"PIN must be at least 4 digits/characters.\"}");
                return;
            }

            SetAdminPin(newPin);
            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine("[ADMIN PIN UPDATED] Admin PIN was changed.");
            Console.ResetColor();
            SendJsonResponse(stream, 200, "{\"success\":true,\"token\":\"" + JsonEscape(newPin) + "\"}");
        }

        private static void HandleSaveConfig(NetworkStream stream, RequestContext req)
        {
            if (!IsAdmin(req))
            {
                SendJsonResponse(stream, 403, "{\"success\":false,\"error\":\"Admin permission required to rename Hub. Please enter Admin PIN.\"}");
                return;
            }

            string body = ReadBodyString(stream, req);
            JavaScriptSerializer js = new JavaScriptSerializer();
            Dictionary<string, string> input = null;
            try
            {
                input = js.Deserialize<Dictionary<string, string>>(body);
            }
            catch {}

            if (input != null && input.ContainsKey("hubName") && !string.IsNullOrWhiteSpace(input["hubName"]))
            {
                string newName = input["hubName"].Trim();
                SetHubName(newName);
                Console.WriteLine("[CONFIG UPDATED] Hub Name changed to: " + newName);
                SendJsonResponse(stream, 200, "{\"success\":true,\"hubName\":\"" + JsonEscape(newName) + "\"}");
            }
            else
            {
                SendJsonResponse(stream, 400, "{\"success\":false,\"error\":\"Valid hubName is required\"}");
            }
        }

        private static void ServeDashboard(NetworkStream stream, bool headOnly)
        {
            string htmlPath = Path.Combine(RootDirectory, "index.html");
            string html = "";
            string currentIp = GetCurrentLocalIp();
            string machineName = GetHostName();
            string hubName = GetHubName();

            if (File.Exists(htmlPath))
            {
                html = File.ReadAllText(htmlPath, Encoding.UTF8);
                html = html.Replace("{{HUB_NAME}}", hubName)
                           .Replace("{{LOCAL_IP}}", currentIp)
                           .Replace("{{HOSTNAME}}", machineName);
            }
            else
            {
                html = "<!DOCTYPE html><html><body><h1>" + hubName + "</h1><p>index.html not found</p></body></html>";
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

        private static void ServeManifest(NetworkStream stream, bool headOnly)
        {
            string manifestPath = Path.Combine(RootDirectory, "manifest.json");
            string json = "";
            string hubName = GetHubName();

            if (File.Exists(manifestPath))
            {
                json = File.ReadAllText(manifestPath, Encoding.UTF8);
                json = json.Replace("{{HUB_NAME}}", hubName);
            }
            else
            {
                json = "{\"name\":\"" + JsonEscape(hubName) + "\",\"short_name\":\"" + JsonEscape(hubName) + "\",\"start_url\":\"/\",\"display\":\"standalone\",\"theme_color\":\"#0b0f19\"}";
            }

            byte[] bytes = Encoding.UTF8.GetBytes(json);
            StringBuilder response = new StringBuilder();
            response.Append("HTTP/1.1 200 OK\r\n");
            response.Append("Content-Type: application/manifest+json; charset=utf-8\r\n");
            response.Append("Content-Length: " + bytes.Length + "\r\n");
            response.Append("Access-Control-Allow-Origin: *\r\n");
            response.Append("Cache-Control: no-cache\r\n");
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
            if (fi.Extension.Equals(".js", StringComparison.OrdinalIgnoreCase) || 
                fi.Extension.Equals(".css", StringComparison.OrdinalIgnoreCase) ||
                fi.Extension.Equals(".json", StringComparison.OrdinalIgnoreCase))
            {
                res.Append("Cache-Control: no-cache, must-revalidate\r\n");
            }
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
