using System;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Effects;
using System.Windows.Media.Animation;
using System.Windows.Shapes;
using System.Windows.Threading;
using System.Windows.Input;
using Microsoft.Win32;

namespace ZoneHub {
    public class BubbleApp : Application {
        [STAThread]
        public static void Main() {
            try {
                AppDomain.CurrentDomain.UnhandledException += (s, e) => {
                    try { File.WriteAllText("bubble_err.log", e.ExceptionObject.ToString()); } catch { }
                };

                bool createdNew;
                using (Mutex mutex = new Mutex(true, "ZoneHub_Desktop_Bubble_Mutex_v4", out createdNew)) {
                    if (!createdNew) {
                        return;
                    }
                    BubbleApp app = new BubbleApp();
                    app.ShutdownMode = ShutdownMode.OnExplicitShutdown;
                    BubbleWindow window = new BubbleWindow();
                    window.Show();
                    app.Run();
                }
            } catch (Exception ex) {
                try { File.WriteAllText("bubble_err.log", ex.ToString()); } catch { }
            }
        }
    }

    public class BubbleWindow : Window {
        private const double BUBBLE_SIZE = 54;
        private const double WINDOW_SIZE = 68; // Padding for glow & badge
        private Canvas rootCanvas;
        private Border bubbleBorder;
        private Border badgeBorder;
        private TextBlock badgeText;
        private Border pulseDot;
        private Window teaserWindow;
        private TextBlock teaserUser;
        private TextBlock teaserText;
        private DispatcherTimer teaserTimer;
        private DispatcherTimer pollTimer;
        private int lastMessageCount = -1;
        private int unreadCount = 0;
        private string configPath;
        private string serverUrl = "http://localhost:8080";
        private IntPtr cachedAppHwnd = IntPtr.Zero;
        private bool isAppRestoredState = false;

        // Win32 API for toggling and minimizing/restoring the ZoneHub App window
        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        private static extern bool IsIconic(IntPtr hWnd);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool IsWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

        [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
        private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        [DllImport("user32.dll")]
        private static extern bool IsWindowVisible(IntPtr hWnd);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool GetCursorPos(out WinPoint lpPoint);

        [StructLayout(LayoutKind.Sequential)]
        private struct WinPoint {
            public int X;
            public int Y;
        }

        private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        private const int SW_RESTORE = 9;
        private const int SW_MINIMIZE = 6;
        private const int SW_SHOW = 5;

        public BubbleWindow() {
            Title = "ZoneHub Desktop Bubble";
            Width = WINDOW_SIZE;
            Height = WINDOW_SIZE;
            WindowStyle = WindowStyle.None;
            AllowsTransparency = true;
            Background = Brushes.Transparent;
            Topmost = true;
            ShowInTaskbar = false;
            ResizeMode = ResizeMode.NoResize;

            configPath = System.IO.Path.Combine(
                AppDomain.CurrentDomain.BaseDirectory,
                "bubble_pos.ini"
            );

            // Default position: DOCKED FLUSH ON THE RIGHT EDGE (Matching user's preferred layout)
            double screenW = SystemParameters.WorkArea.Width;
            double screenH = SystemParameters.WorkArea.Height;
            double defaultLeft = Math.Max(10, screenW - WINDOW_SIZE - 4);
            double defaultTop = (screenH - WINDOW_SIZE) * 0.45;

            // Auto-detect server URL (works on both Host PC and Employee PCs)
            string serverFile = System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "bubble_server.txt");
            if (File.Exists(serverFile)) {
                try {
                    string s = File.ReadAllText(serverFile).Trim();
                    if (!string.IsNullOrEmpty(s)) serverUrl = s.TrimEnd('/');
                } catch { }
            } else {
                try {
                    using (var wc = new WebClient()) {
                        wc.DownloadString("http://localhost:8080/api/my-info");
                    }
                } catch {
                    serverUrl = "http://192.168.0.118:8080";
                }
            }

            LoadPosition(defaultLeft, defaultTop);

            BuildUI();
            BuildTeaserWindow();
            InitPolling();

            // Keep topmost active
            Deactivated += (s, e) => {
                Topmost = true;
            };

            // Register this machine's actual device name with ZoneHub server
            ThreadPool.QueueUserWorkItem(s => {
                try {
                    string myPc = Environment.MachineName;
                    using (WebClient wc = new WebClient()) {
                        wc.DownloadString(serverUrl + "/api/register-device?name=" + Uri.EscapeDataString(myPc));
                    }
                } catch { }
            });
        }

        private void BuildUI() {
            rootCanvas = new Canvas {
                Width = WINDOW_SIZE,
                Height = WINDOW_SIZE,
                Background = Brushes.Transparent
            };

            // Pure Floating Squircle Logo (No white background circle!)
            bubbleBorder = new Border {
                Width = BUBBLE_SIZE,
                Height = BUBBLE_SIZE,
                CornerRadius = new CornerRadius(14),
                BorderThickness = new Thickness(1.8),
                BorderBrush = new SolidColorBrush(Color.FromArgb(160, 255, 255, 255)),
                Cursor = Cursors.Hand,
                RenderTransformOrigin = new Point(0.5, 0.5),
                RenderTransform = new ScaleTransform(1.0, 1.0)
            };

            // Linear Gradient background for the logo
            LinearGradientBrush gradient = new LinearGradientBrush {
                StartPoint = new Point(0, 0),
                EndPoint = new Point(1, 1)
            };
            gradient.GradientStops.Add(new GradientStop(Color.FromRgb(67, 56, 202), 0.0));  // Indigo
            gradient.GradientStops.Add(new GradientStop(Color.FromRgb(6, 182, 212), 1.0));  // Cyan
            bubbleBorder.Background = gradient;

            // Vibrant Cyan-Indigo Glow & Drop Shadow
            bubbleBorder.Effect = new DropShadowEffect {
                Color = Color.FromRgb(6, 182, 212),
                BlurRadius = 18,
                ShadowDepth = 3,
                Opacity = 0.65
            };

            // ZoneHub Orbit SVG Vector Icon inside
            Viewbox iconBox = new Viewbox {
                Width = 30,
                Height = 30,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            };
            Canvas iconCanvas = new Canvas { Width = 48, Height = 48 };

            // Outer dashed orbit
            System.Windows.Shapes.Path orbitOuter = new System.Windows.Shapes.Path {
                Stroke = Brushes.White,
                StrokeThickness = 1.4,
                Opacity = 0.35,
                Data = new EllipseGeometry(new Point(24, 24), 18, 18)
            };
            // Inner orbit
            System.Windows.Shapes.Path orbitInner = new System.Windows.Shapes.Path {
                Stroke = Brushes.White,
                StrokeThickness = 1.4,
                Opacity = 0.45,
                Data = new EllipseGeometry(new Point(24, 24), 11, 11)
            };
            // Triangle lines
            System.Windows.Shapes.Path lines = new System.Windows.Shapes.Path {
                Stroke = Brushes.White,
                StrokeThickness = 2.2,
                StrokeEndLineCap = PenLineCap.Round,
                StrokeStartLineCap = PenLineCap.Round,
                Data = Geometry.Parse("M 24,13 L 15,31 L 33,31 Z")
            };
            // Node circles
            System.Windows.Shapes.Path centerNode = new System.Windows.Shapes.Path {
                Fill = Brushes.White,
                Data = new EllipseGeometry(new Point(24, 25), 2.5, 2.5)
            };
            System.Windows.Shapes.Path topNode = new System.Windows.Shapes.Path {
                Fill = Brushes.White,
                Data = new EllipseGeometry(new Point(24, 13), 4.5, 4.5)
            };
            System.Windows.Shapes.Path leftNode = new System.Windows.Shapes.Path {
                Fill = new SolidColorBrush(Color.FromRgb(6, 182, 212)),
                Data = new EllipseGeometry(new Point(15, 31), 4.2, 4.2)
            };
            System.Windows.Shapes.Path rightNode = new System.Windows.Shapes.Path {
                Fill = new SolidColorBrush(Color.FromRgb(16, 185, 129)),
                Data = new EllipseGeometry(new Point(33, 31), 4.2, 4.2)
            };

            iconCanvas.Children.Add(orbitOuter);
            iconCanvas.Children.Add(orbitInner);
            iconCanvas.Children.Add(lines);
            iconCanvas.Children.Add(centerNode);
            iconCanvas.Children.Add(topNode);
            iconCanvas.Children.Add(leftNode);
            iconCanvas.Children.Add(rightNode);
            iconBox.Child = iconCanvas;
            bubbleBorder.Child = iconBox;

            Canvas.SetLeft(bubbleBorder, 6);
            Canvas.SetTop(bubbleBorder, 6);
            rootCanvas.Children.Add(bubbleBorder);

            // Green Pulse Dot (Online Indicator)
            pulseDot = new Border {
                Width = 11,
                Height = 11,
                CornerRadius = new CornerRadius(5.5),
                Background = new SolidColorBrush(Color.FromRgb(16, 185, 129)),
                BorderThickness = new Thickness(2),
                BorderBrush = new SolidColorBrush(Color.FromRgb(11, 15, 25)),
                Effect = new DropShadowEffect {
                    Color = Color.FromRgb(16, 185, 129),
                    BlurRadius = 8,
                    ShadowDepth = 0,
                    Opacity = 0.95
                }
            };
            Canvas.SetLeft(pulseDot, 3);
            Canvas.SetTop(pulseDot, 3);
            rootCanvas.Children.Add(pulseDot);

            // Red Unread Badge (Top-Right)
            badgeBorder = new Border {
                MinWidth = 20,
                Height = 20,
                CornerRadius = new CornerRadius(10),
                Background = new SolidColorBrush(Color.FromRgb(244, 63, 94)),
                BorderThickness = new Thickness(2),
                BorderBrush = new SolidColorBrush(Color.FromRgb(11, 15, 25)),
                Padding = new Thickness(3, 0, 3, 0),
                Visibility = Visibility.Collapsed,
                Effect = new DropShadowEffect {
                    Color = Color.FromRgb(244, 63, 94),
                    BlurRadius = 8,
                    ShadowDepth = 1,
                    Opacity = 0.9
                }
            };
            badgeText = new TextBlock {
                Text = "0",
                Foreground = Brushes.White,
                FontSize = 10,
                FontWeight = FontWeights.ExtraBold,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            };
            badgeBorder.Child = badgeText;
            Canvas.SetRight(badgeBorder, 2);
            Canvas.SetTop(badgeBorder, 2);
            rootCanvas.Children.Add(badgeBorder);

            // Mouse Event Handlers for Dragging & Clicking
            bubbleBorder.MouseLeftButtonDown += OnBubbleMouseDown;
            bubbleBorder.MouseRightButtonUp += OnBubbleRightClick;

            // Hover animations
            bubbleBorder.MouseEnter += (s, e) => {
                ScaleTransform st = bubbleBorder.RenderTransform as ScaleTransform;
                if (st != null) {
                    DoubleAnimation anim = new DoubleAnimation(1.1, TimeSpan.FromMilliseconds(150));
                    st.BeginAnimation(ScaleTransform.ScaleXProperty, anim);
                    st.BeginAnimation(ScaleTransform.ScaleYProperty, anim);
                }
            };
            bubbleBorder.MouseLeave += (s, e) => {
                ScaleTransform st = bubbleBorder.RenderTransform as ScaleTransform;
                if (st != null) {
                    DoubleAnimation anim = new DoubleAnimation(1.0, TimeSpan.FromMilliseconds(150));
                    st.BeginAnimation(ScaleTransform.ScaleXProperty, anim);
                    st.BeginAnimation(ScaleTransform.ScaleYProperty, anim);
                }
            };

            Content = rootCanvas;
        }

        private void BuildTeaserWindow() {
            teaserWindow = new Window {
                Width = 260,
                Height = 60,
                WindowStyle = WindowStyle.None,
                AllowsTransparency = true,
                Background = Brushes.Transparent,
                Topmost = true,
                ShowInTaskbar = false,
                ResizeMode = ResizeMode.NoResize
            };

            Border teaserBorder = new Border {
                Background = new SolidColorBrush(Color.FromArgb(248, 15, 23, 42)),
                BorderThickness = new Thickness(1),
                BorderBrush = new SolidColorBrush(Color.FromArgb(140, 99, 102, 241)),
                CornerRadius = new CornerRadius(14),
                Padding = new Thickness(10, 8, 10, 8),
                Cursor = Cursors.Hand,
                Effect = new DropShadowEffect {
                    Color = Colors.Black,
                    BlurRadius = 22,
                    ShadowDepth = 5,
                    Opacity = 0.75
                }
            };

            Grid grid = new Grid();
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(32) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(20) });

            // Avatar
            Border avatar = new Border {
                Width = 28,
                Height = 28,
                CornerRadius = new CornerRadius(8),
                Background = new LinearGradientBrush {
                    StartPoint = new Point(0, 0),
                    EndPoint = new Point(1, 1),
                    GradientStops = new GradientStopCollection {
                        new GradientStop(Color.FromRgb(99, 102, 241), 0.0),
                        new GradientStop(Color.FromRgb(6, 182, 212), 1.0)
                    }
                }
            };
            TextBlock avatarText = new TextBlock {
                Text = "💬",
                FontSize = 13,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            };
            avatar.Child = avatarText;
            Grid.SetColumn(avatar, 0);
            grid.Children.Add(avatar);

            // Message text
            StackPanel textPanel = new StackPanel {
                Margin = new Thickness(8, 0, 4, 0),
                VerticalAlignment = VerticalAlignment.Center
            };
            teaserUser = new TextBlock {
                Text = "ZoneHub Team",
                Foreground = new SolidColorBrush(Color.FromRgb(56, 189, 248)),
                FontSize = 11,
                FontWeight = FontWeights.Bold
            };
            teaserText = new TextBlock {
                Text = "New message received",
                Foreground = new SolidColorBrush(Color.FromRgb(203, 213, 225)),
                FontSize = 11,
                TextTrimming = TextTrimming.CharacterEllipsis
            };
            textPanel.Children.Add(teaserUser);
            textPanel.Children.Add(teaserText);
            Grid.SetColumn(textPanel, 1);
            grid.Children.Add(textPanel);

            // Close button
            TextBlock closeBtn = new TextBlock {
                Text = "✕",
                Foreground = new SolidColorBrush(Color.FromRgb(148, 163, 184)),
                FontSize = 11,
                VerticalAlignment = VerticalAlignment.Top,
                HorizontalAlignment = HorizontalAlignment.Right,
                Cursor = Cursors.Hand
            };
            closeBtn.MouseLeftButtonDown += (s, e) => {
                e.Handled = true;
                teaserWindow.Hide();
            };
            Grid.SetColumn(closeBtn, 2);
            grid.Children.Add(closeBtn);

            teaserBorder.Child = grid;
            teaserBorder.MouseLeftButtonDown += (s, e) => {
                teaserWindow.Hide();
                unreadCount = 0;
                badgeBorder.Visibility = Visibility.Collapsed;
                ToggleZoneHubApp(openChatTab: true);
            };

            teaserWindow.Content = teaserBorder;

            teaserTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(5) };
            teaserTimer.Tick += (s, e) => {
                teaserTimer.Stop();
                teaserWindow.Hide();
            };
        }

        private void ShowDesktopTeaser(string user, string message) {
            try {
                teaserUser.Text = string.IsNullOrEmpty(user) ? "Team Member" : user;
                teaserText.Text = string.IsNullOrEmpty(message) ? "Sent a file" : message;

                double screenW = SystemParameters.WorkArea.Width;
                double teaserLeft = (Left < screenW / 2) ? (Left + Width + 8) : (Left - teaserWindow.Width - 8);

                teaserWindow.Left = teaserLeft;
                teaserWindow.Top = Top + (Height - teaserWindow.Height) / 2;

                teaserWindow.Show();
                teaserTimer.Stop();
                teaserTimer.Start();
            } catch { }
        }

        // Universal Dragging & Click Handling
        private void OnBubbleMouseDown(object sender, MouseButtonEventArgs e) {
            if (e.ChangedButton == MouseButton.Left) {
                WinPoint startPt;
                GetCursorPos(out startPt);
                DateTime startTime = DateTime.Now;

                try {
                    DragMove();
                } catch { }

                WinPoint endPt;
                GetCursorPos(out endPt);
                int dx = endPt.X - startPt.X;
                int dy = endPt.Y - startPt.Y;
                double dist = Math.Sqrt(dx * dx + dy * dy);
                TimeSpan elapsed = DateTime.Now - startTime;

                if (dist < 6 && elapsed.TotalMilliseconds < 500) {
                    // Tap / Click on the Bubble!
                    OnBubbleClicked();
                } else {
                    // Universal move! The user moved the bubble anywhere on screen.
                    ClampInsideScreen();
                    SavePosition();
                }
            }
        }

        private void ClampInsideScreen() {
            try {
                double screenW = SystemParameters.VirtualScreenWidth;
                double screenH = SystemParameters.VirtualScreenHeight;
                if (Left < 0) Left = 0;
                if (Top < 0) Top = 0;
                if (Left > screenW - Width) Left = screenW - Width;
                if (Top > screenH - Height) Top = screenH - Height;
            } catch { }
        }

        private void OnBubbleClicked() {
            bool hasUnread = (unreadCount > 0);
            unreadCount = 0;
            badgeBorder.Visibility = Visibility.Collapsed;
            teaserWindow.Hide();

            // Toggle ZoneHub App (First time opens, then toggles between Minimize and Restore!)
            ToggleZoneHubApp(openChatTab: hasUnread);
        }

        private bool IsMatchingZoneHubTitle(string title) {
            if (string.IsNullOrEmpty(title)) return false;
            return title.IndexOf("ZoneHub", StringComparison.OrdinalIgnoreCase) >= 0 ||
                   title.IndexOf("Media Hub", StringComparison.OrdinalIgnoreCase) >= 0 ||
                   title.IndexOf("Team Chat", StringComparison.OrdinalIgnoreCase) >= 0 ||
                   title.IndexOf(":8080", StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private IntPtr FindZoneHubAppWindow() {
            if (cachedAppHwnd != IntPtr.Zero && IsWindow(cachedAppHwnd)) {
                StringBuilder sb = new StringBuilder(512);
                GetWindowText(cachedAppHwnd, sb, 512);
                string title = sb.ToString();
                if (IsMatchingZoneHubTitle(title)) {
                    return cachedAppHwnd;
                }
            }

            IntPtr found = IntPtr.Zero;
            try {
                EnumWindows((hWnd, lParam) => {
                    if (!IsWindowVisible(hWnd) && !IsIconic(hWnd)) return true;
                    StringBuilder sb = new StringBuilder(512);
                    GetWindowText(hWnd, sb, 512);
                    string title = sb.ToString();
                    if (!string.IsNullOrEmpty(title) && !title.Contains("Desktop Bubble")) {
                        if (IsMatchingZoneHubTitle(title)) {
                            found = hWnd;
                            cachedAppHwnd = hWnd;
                            return false; // Found match, stop enum
                        }
                    }
                    return true;
                }, IntPtr.Zero);
            } catch { }
            return found;
        }

        private void ToggleZoneHubApp(bool openChatTab = false) {
            try {
                if (openChatTab) {
                    SendTargetTabSignal("chat");
                }

                IntPtr appHwnd = FindZoneHubAppWindow();

                if (appHwnd != IntPtr.Zero) {
                    bool isMinimized = IsIconic(appHwnd);
                    if (isMinimized) {
                        // Window is currently minimized -> RESTORE AND BRING TO FRONT!
                        ShowWindow(appHwnd, SW_RESTORE);
                        SetForegroundWindow(appHwnd);
                        isAppRestoredState = true;
                    } else if (isAppRestoredState && !openChatTab) {
                        // Window is currently visible on screen -> MINIMIZE IT!
                        ShowWindow(appHwnd, SW_MINIMIZE);
                        isAppRestoredState = false;
                    } else {
                        // Window is behind other windows or new chat notification arrived -> BRING TO FRONT!
                        ShowWindow(appHwnd, SW_RESTORE);
                        SetForegroundWindow(appHwnd);
                        isAppRestoredState = true;
                    }
                } else {
                    // First time only: App is closed -> Launch standalone native Desktop App!
                    string targetUrl = BuildAppUrl(openChatTab ? "tab=chat" : null);
                    LaunchStandaloneApp(targetUrl);
                    isAppRestoredState = true;
                }
            } catch {
                string targetUrl = BuildAppUrl(openChatTab ? "tab=chat" : null);
                LaunchStandaloneApp(targetUrl);
                isAppRestoredState = true;
            }
        }

        private void SendTargetTabSignal(string tabName) {
            try {
                ThreadPool.QueueUserWorkItem(state => {
                    try {
                        using (WebClient wc = new WebClient()) {
                            wc.DownloadString(serverUrl + "/api/target-tab?set=" + tabName);
                        }
                    } catch { }
                });
            } catch { }
        }

        private string BuildAppUrl(string extraParams = null) {
            string cleanServer = serverUrl.TrimEnd('/');
            string myPcName = Environment.MachineName;
            StringBuilder sb = new StringBuilder();
            sb.Append(cleanServer).Append("/?");
            if (!string.IsNullOrEmpty(extraParams)) {
                string ep = extraParams.TrimStart('?', '&');
                sb.Append(ep).Append("&");
            }
            sb.Append("user=").Append(Uri.EscapeDataString(myPcName));
            return sb.ToString();
        }

        private void LaunchStandaloneApp(string appUrl = null) {
            if (string.IsNullOrEmpty(appUrl)) {
                appUrl = BuildAppUrl(null);
            }

            string edgePath = @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe";
            if (!File.Exists(edgePath)) {
                edgePath = @"C:\Program Files\Microsoft\Edge\Application\msedge.exe";
            }

            string chromePath = @"C:\Program Files\Google\Chrome\Application\chrome.exe";
            if (!File.Exists(chromePath)) {
                chromePath = @"C:\Program Files\Google\Chrome\Application\chrome.exe";
            }

            try {
                if (File.Exists(edgePath)) {
                    Process.Start(edgePath, string.Format("--app=\"{0}\"", appUrl));
                } else if (File.Exists(chromePath)) {
                    Process.Start(chromePath, string.Format("--app=\"{0}\"", appUrl));
                } else {
                    Process.Start(appUrl);
                }
            } catch {
                Process.Start(appUrl);
            }
        }

        private void OpenZoneHubMini() {
            string miniUrl = BuildAppUrl("view=mini");
            double screenW = SystemParameters.WorkArea.Width;
            double screenH = SystemParameters.WorkArea.Height;
            int winW = 400;
            int winH = (int)Math.Min(780, screenH - 60);
            int posX = (int)(screenW - winW - 12);
            int posY = 40;

            string flags = string.Format("--app=\"{0}\" --window-size={1},{2} --window-position={3},{4}", miniUrl, winW, winH, posX, posY);

            string edgePath = @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe";
            if (!File.Exists(edgePath)) {
                edgePath = @"C:\Program Files\Microsoft\Edge\Application\msedge.exe";
            }

            string chromePath = @"C:\Program Files\Google\Chrome\Application\chrome.exe";
            if (!File.Exists(chromePath)) {
                chromePath = @"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe";
            }

            try {
                if (File.Exists(edgePath)) {
                    Process.Start(edgePath, flags);
                } else if (File.Exists(chromePath)) {
                    Process.Start(chromePath, flags);
                } else {
                    Process.Start(miniUrl);
                }
            } catch {
                Process.Start(miniUrl);
            }
        }

        private void OnBubbleRightClick(object sender, MouseButtonEventArgs e) {
            ContextMenu cm = new ContextMenu();

            MenuItem miMini = new MenuItem { Header = "📌 Open Corner Dock (এক কোণায় মিনি চ্যাট)" };
            miMini.Click += (s, args) => OpenZoneHubMini();
            cm.Items.Add(miMini);

            MenuItem miToggle = new MenuItem { Header = "⚡ Open / Minimize Full App (ফুল অ্যাপ ওপেন)" };
            miToggle.Click += (s, args) => ToggleZoneHubApp();
            cm.Items.Add(miToggle);

            MenuItem miCopy = new MenuItem { Header = "📋 Copy App Link (" + serverUrl + ")" };
            miCopy.Click += (s, args) => {
                try {
                    Clipboard.SetText(serverUrl + "/");
                    MessageBox.Show("ZoneHub App Link Copied:\n" + serverUrl + "/", "ZoneHub");
                } catch { }
            };
            cm.Items.Add(miCopy);

            cm.Items.Add(new Separator());

            MenuItem miSnapLeft = new MenuItem { Header = "⬅ Snap to Left Edge" };
            miSnapLeft.Click += (s, args) => {
                Left = 4;
                SavePosition();
            };
            cm.Items.Add(miSnapLeft);

            MenuItem miSnapRight = new MenuItem { Header = "➡ Snap to Right Edge" };
            miSnapRight.Click += (s, args) => {
                Left = SystemParameters.WorkArea.Width - Width - 4;
                SavePosition();
            };
            cm.Items.Add(miSnapRight);

            cm.Items.Add(new Separator());

            MenuItem miAutoStart = new MenuItem {
                Header = "🚀 Run on Windows Startup",
                IsCheckable = true,
                IsChecked = IsAutoStartEnabled()
            };
            miAutoStart.Click += (s, args) => {
                SetAutoStart(miAutoStart.IsChecked);
            };
            cm.Items.Add(miAutoStart);

            MenuItem miExit = new MenuItem { Header = "✕ Exit Desktop Bubble" };
            miExit.Click += (s, args) => {
                try { teaserWindow.Close(); } catch { }
                try { Close(); } catch { }
                Application.Current.Shutdown();
            };
            cm.Items.Add(miExit);

            cm.IsOpen = true;
        }

        // Real-Time Polling for Messages from ZoneHub server
        private void InitPolling() {
            pollTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(2.5) };
            pollTimer.Tick += (s, e) => PollServer();
            pollTimer.Start();
        }

        private void PollServer() {
            ThreadPool.QueueUserWorkItem(state => {
                try {
                    string pollUrl = serverUrl + "/api/messages?t=" + DateTime.Now.Ticks;
                    HttpWebRequest request = (HttpWebRequest)WebRequest.Create(pollUrl);
                    request.Timeout = 2000;
                    using (HttpWebResponse response = (HttpWebResponse)request.GetResponse()) {
                        if (response.StatusCode == HttpStatusCode.OK) {
                            using (StreamReader reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8)) {
                                string json = reader.ReadToEnd();
                                ParseMessagesResult(json);
                            }
                        }
                    }
                } catch {
                    // Safe silent ignore if server temporarily restarting
                }
            });
        }

        private void ParseMessagesResult(string json) {
            try {
                if (string.IsNullOrEmpty(json) || json.Length < 5) return;

                // Count messages by counting occurrence of "id":
                int count = 0;
                int idx = 0;
                while ((idx = json.IndexOf("\"id\":", idx)) != -1) {
                    count++;
                    idx += 5;
                }

                if (lastMessageCount == -1) {
                    // Initial load - establish baseline
                    lastMessageCount = count;
                    return;
                }

                if (count > lastMessageCount) {
                    int diff = count - lastMessageCount;
                    lastMessageCount = count;

                    // Extract latest sender name
                    string sender = "Team Member";
                    string preview = "New message";

                    int lastUserIdx = json.LastIndexOf("\"user\":");
                    if (lastUserIdx != -1) {
                        int uStart = json.IndexOf('"', lastUserIdx + 7) + 1;
                        int uEnd = json.IndexOf('"', uStart);
                        if (uEnd > uStart) sender = json.Substring(uStart, uEnd - uStart);
                    }

                    int lastTextIdx = json.LastIndexOf("\"text\":");
                    if (lastTextIdx != -1) {
                        int tStart = json.IndexOf('"', lastTextIdx + 7) + 1;
                        int tEnd = json.IndexOf('"', tStart);
                        if (tEnd > tStart) preview = json.Substring(tStart, tEnd - tStart);
                    }

                    Dispatcher.Invoke(new Action(() => {
                        OnNewMessageReceived(sender, preview, diff);
                    }));
                }
            } catch { }
        }

        private void OnNewMessageReceived(string user, string text, int diff) {
            unreadCount += diff;
            badgeText.Text = unreadCount > 99 ? "99+" : unreadCount.ToString();
            badgeBorder.Visibility = Visibility.Visible;

            // Bubble bounce animation
            ScaleTransform st = bubbleBorder.RenderTransform as ScaleTransform;
            if (st != null) {
                DoubleAnimation bounce = new DoubleAnimation(1.2, TimeSpan.FromMilliseconds(180)) {
                    AutoReverse = true,
                    RepeatBehavior = new RepeatBehavior(2)
                };
                st.BeginAnimation(ScaleTransform.ScaleXProperty, bounce);
                st.BeginAnimation(ScaleTransform.ScaleYProperty, bounce);
            }

            try {
                System.Media.SystemSounds.Asterisk.Play();
            } catch { }

            ShowDesktopTeaser(user, text);
        }

        private void LoadPosition(double defaultLeft, double defaultTop) {
            try {
                if (File.Exists(configPath)) {
                    string[] lines = File.ReadAllLines(configPath);
                    foreach (string line in lines) {
                        string[] parts = line.Split('=');
                        if (parts.Length == 2) {
                            if (parts[0].Trim() == "Left") Left = double.Parse(parts[1].Trim());
                            if (parts[0].Trim() == "Top") Top = double.Parse(parts[1].Trim());
                        }
                    }
                    return;
                }
            } catch { }

            Left = defaultLeft;
            Top = defaultTop;
        }

        private void SavePosition() {
            try {
                File.WriteAllText(configPath, string.Format("Left={0}\nTop={1}\n", Left, Top));
            } catch { }
        }

        private bool IsAutoStartEnabled() {
            try {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", false)) {
                    if (key != null) {
                        return key.GetValue("ZoneHubBubble") != null;
                    }
                }
            } catch { }
            return false;
        }

        private void SetAutoStart(bool enable) {
            try {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true)) {
                    if (key != null) {
                        if (enable) {
                            string exePath = System.Reflection.Assembly.GetExecutingAssembly().Location;
                            key.SetValue("ZoneHubBubble", "\"" + exePath + "\"");
                        } else {
                            key.DeleteValue("ZoneHubBubble", false);
                        }
                    }
                }
            } catch (Exception ex) {
                MessageBox.Show("Could not update Auto-Start: " + ex.Message, "ZoneHub");
            }
        }
    }
}
