using System;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Diagnostics;
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
                    File.WriteAllText("bubble_err.log", e.ExceptionObject.ToString());
                };

                bool createdNew;
                using (Mutex mutex = new Mutex(true, "ZoneHub_Desktop_Bubble_Mutex", out createdNew)) {
                    if (!createdNew) {
                        return;
                    }
                    BubbleApp app = new BubbleApp();
                    BubbleWindow window = new BubbleWindow();
                    window.Show();
                    app.Run(window);
                }
            } catch (Exception ex) {
                File.WriteAllText("bubble_err.log", ex.ToString());
            }
        }
    }

    public class BubbleWindow : Window {
        private const double BUBBLE_SIZE = 64;
        private const double WINDOW_SIZE = 76; // Allows room for glow & badge
        private Canvas rootCanvas;
        private Border bubbleBorder;
        private Border badgeBorder;
        private TextBlock badgeText;
        private Border pulseDot;
        private Window teaserWindow;
        private TextBlock teaserUser;
        private TextBlock teaserText;
        private DispatcherTimer teaserTimer;

        private Point mouseDownScreenPos;
        private Point mouseDownWindowPos;
        private DateTime mouseDownTime;
        private bool isDragging = false;

        private DispatcherTimer pollTimer;
        private long lastMessageTimestamp = 0;
        private int unreadCount = 0;
        private string configPath;
        private string serverUrl = "http://localhost:8080";

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

            // Restore last saved position or default to bottom-right corner of screen
            double screenW = SystemParameters.WorkArea.Width;
            double screenH = SystemParameters.WorkArea.Height;
            double defaultLeft = screenW - WINDOW_SIZE - 24;
            double defaultTop = screenH - WINDOW_SIZE - 40;

            LoadPosition(defaultLeft, defaultTop);

            BuildUI();
            BuildTeaserWindow();
            InitPolling();
        }

        private void BuildUI() {
            rootCanvas = new Canvas {
                Width = WINDOW_SIZE,
                Height = WINDOW_SIZE,
                Background = Brushes.Transparent
            };

            // Main Circle Bubble
            bubbleBorder = new Border {
                Width = BUBBLE_SIZE,
                Height = BUBBLE_SIZE,
                CornerRadius = new CornerRadius(BUBBLE_SIZE / 2),
                BorderThickness = new Thickness(2.5),
                BorderBrush = new SolidColorBrush(Color.FromArgb(140, 255, 255, 255)),
                Cursor = Cursors.Hand,
                RenderTransformOrigin = new Point(0.5, 0.5),
                RenderTransform = new ScaleTransform(1.0, 1.0)
            };

            // Linear Gradient background
            LinearGradientBrush gradient = new LinearGradientBrush {
                StartPoint = new Point(0, 0),
                EndPoint = new Point(1, 1)
            };
            gradient.GradientStops.Add(new GradientStop(Color.FromRgb(67, 56, 202), 0.0));  // Indigo
            gradient.GradientStops.Add(new GradientStop(Color.FromRgb(6, 182, 212), 1.0));  // Cyan
            bubbleBorder.Background = gradient;

            // Soft Glow Drop Shadow
            bubbleBorder.Effect = new DropShadowEffect {
                Color = Color.FromRgb(6, 182, 212),
                BlurRadius = 16,
                ShadowDepth = 3,
                Opacity = 0.65
            };

            // ZoneHub Orbit SVG Icon
            Viewbox iconBox = new Viewbox {
                Width = 32,
                Height = 32,
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

            // Pulsing Green Online Dot (Top-Left)
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
                    Opacity = 0.9
                }
            };
            Canvas.SetLeft(pulseDot, 6);
            Canvas.SetTop(pulseDot, 6);
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
                    Opacity = 0.85
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
            bubbleBorder.MouseMove += OnBubbleMouseMove;
            bubbleBorder.MouseLeftButtonUp += OnBubbleMouseUp;
            bubbleBorder.MouseRightButtonUp += OnBubbleRightClick;

            // Hover animations
            bubbleBorder.MouseEnter += (s, e) => {
                ScaleTransform st = bubbleBorder.RenderTransform as ScaleTransform;
                if (st != null) {
                    DoubleAnimation anim = new DoubleAnimation(1.08, TimeSpan.FromMilliseconds(150));
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
                Background = new SolidColorBrush(Color.FromArgb(245, 15, 23, 42)),
                BorderThickness = new Thickness(1),
                BorderBrush = new SolidColorBrush(Color.FromArgb(120, 99, 102, 241)),
                CornerRadius = new CornerRadius(14),
                Padding = new Thickness(10, 8, 10, 8),
                Cursor = Cursors.Hand,
                Effect = new DropShadowEffect {
                    Color = Colors.Black,
                    BlurRadius = 20,
                    ShadowDepth = 6,
                    Opacity = 0.7
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
                Background = new LinearGradientBrush(Color.FromRgb(99, 102, 241), Color.FromRgb(6, 182, 212), 45)
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
                OpenZoneHubFull();
            };

            teaserWindow.Content = teaserBorder;

            teaserTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(5) };
            teaserTimer.Tick += (s, e) => {
                teaserTimer.Stop();
                teaserWindow.Hide();
            };
        }

        private void ShowDesktopTeaser(string user, string message) {
            teaserUser.Text = string.IsNullOrEmpty(user) ? "Team Member" : user;
            teaserText.Text = string.IsNullOrEmpty(message) ? "Sent a file" : message;

            // Position teaser immediately to the left of the bubble
            double screenW = SystemParameters.WorkArea.Width;
            double teaserLeft = Left - teaserWindow.Width - 10;
            if (teaserLeft < 10) {
                // If bubble is on the left edge, show teaser on the right of the bubble
                teaserLeft = Left + Width + 10;
            }
            teaserWindow.Left = teaserLeft;
            teaserWindow.Top = Top + (Height - teaserWindow.Height) / 2;

            teaserWindow.Show();
            teaserTimer.Stop();
            teaserTimer.Start();
        }

        // Mouse Drag & Click Handling
        private void OnBubbleMouseDown(object sender, MouseButtonEventArgs e) {
            if (e.ChangedButton == MouseButton.Left) {
                mouseDownScreenPos = PointToScreen(e.GetPosition(this));
                mouseDownWindowPos = e.GetPosition(this);
                mouseDownTime = DateTime.Now;
                isDragging = false;
                bubbleBorder.CaptureMouse();
            }
        }

        private void OnBubbleMouseMove(object sender, MouseEventArgs e) {
            if (bubbleBorder.IsMouseCaptured && e.LeftButton == MouseButtonState.Pressed) {
                Point currentScreenPos = PointToScreen(e.GetPosition(this));
                double dx = currentScreenPos.X - mouseDownScreenPos.X;
                double dy = currentScreenPos.Y - mouseDownScreenPos.Y;

                if (!isDragging && (Math.Abs(dx) > 4 || Math.Abs(dy) > 4)) {
                    isDragging = true;
                }

                if (isDragging) {
                    Left += dx;
                    Top += dy;
                    mouseDownScreenPos = currentScreenPos;

                    // Keep inside work area bounds
                    double maxLeft = SystemParameters.WorkArea.Right - Width;
                    double maxTop = SystemParameters.WorkArea.Bottom - Height;
                    if (Left < 0) Left = 0;
                    if (Top < 0) Top = 0;
                    if (Left > maxLeft) Left = maxLeft;
                    if (Top > maxTop) Top = maxTop;
                }
            }
        }

        private void OnBubbleMouseUp(object sender, MouseButtonEventArgs e) {
            if (bubbleBorder.IsMouseCaptured) {
                bubbleBorder.ReleaseMouseCapture();

                if (!isDragging) {
                    TimeSpan elapsed = DateTime.Now - mouseDownTime;
                    if (elapsed.TotalMilliseconds < 400) {
                        // User Clicked the Bubble!
                        OnBubbleClicked();
                    }
                } else {
                    // Finished dragging - save position!
                    SavePosition();
                }
                isDragging = false;
            }
        }

        private void OnBubbleClicked() {
            // Clear unread badge
            unreadCount = 0;
            badgeBorder.Visibility = Visibility.Collapsed;
            teaserWindow.Hide();

            // Open or bring ZoneHub to the front in full view!
            OpenZoneHubFull();
        }

        private void OpenZoneHubFull() {
            try {
                Process.Start(serverUrl);
            } catch (Exception ex) {
                MessageBox.Show("Could not open browser: " + ex.Message, "ZoneHub");
            }
        }

        private void OpenZoneHubMini() {
            try {
                // Try launching in a clean app window via Edge or Chrome
                string miniUrl = serverUrl + "/?view=mini";
                string edgePath = @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe";
                if (!File.Exists(edgePath)) {
                    edgePath = @"C:\Program Files\Microsoft\Edge\Application\msedge.exe";
                }

                if (File.Exists(edgePath)) {
                    Process.Start(edgePath, string.Format("--app=\"{0}\"", miniUrl));
                } else {
                    Process.Start(miniUrl);
                }
            } catch {
                Process.Start(serverUrl + "/?view=mini");
            }
        }

        private void OnBubbleRightClick(object sender, MouseButtonEventArgs e) {
            ContextMenu cm = new ContextMenu();

            MenuItem miOpen = new MenuItem { Header = "🌐 Open ZoneHub (Full View)" };
            miOpen.Click += (s, args) => OpenZoneHubFull();
            cm.Items.Add(miOpen);

            MenuItem miMini = new MenuItem { Header = "📌 Open Mini Dock Window" };
            miMini.Click += (s, args) => OpenZoneHubMini();
            cm.Items.Add(miMini);

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

            MenuItem miResetPos = new MenuItem { Header = "🎯 Reset Position (Bottom-Right)" };
            miResetPos.Click += (s, args) => {
                Left = SystemParameters.WorkArea.Width - WINDOW_SIZE - 24;
                Top = SystemParameters.WorkArea.Height - WINDOW_SIZE - 40;
                SavePosition();
            };
            cm.Items.Add(miResetPos);

            cm.Items.Add(new Separator());

            MenuItem miExit = new MenuItem { Header = "✕ Exit Desktop Bubble" };
            miExit.Click += (s, args) => {
                teaserWindow.Close();
                Close();
            };
            cm.Items.Add(miExit);

            cm.IsOpen = true;
        }

        // Real-Time Background Polling for Chat Messages
        private void InitPolling() {
            pollTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(2.5) };
            pollTimer.Tick += (s, e) => PollServer();
            pollTimer.Start();
        }

        private void PollServer() {
            ThreadPool.QueueUserWorkItem(state => {
                try {
                    string pollUrl = serverUrl + "/api/chat/poll?since=" + lastMessageTimestamp;
                    HttpWebRequest request = (HttpWebRequest)WebRequest.Create(pollUrl);
                    request.Timeout = 2000;
                    using (HttpWebResponse response = (HttpWebResponse)request.GetResponse()) {
                        if (response.StatusCode == HttpStatusCode.OK) {
                            using (StreamReader reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8)) {
                                string json = reader.ReadToEnd();
                                ParsePollResult(json);
                            }
                        }
                    }
                } catch {
                    // Server might be temporarily restarting
                }
            });
        }

        private void ParsePollResult(string json) {
            if (string.IsNullOrEmpty(json) || json.Length < 10) return;

            // Simple fast JSON extractor for zero dependencies
            // Looks for "time":123456789 and "text":"..." and "user":"..."
            int timeIdx = json.LastIndexOf("\"time\":");
            if (timeIdx != -1) {
                int start = timeIdx + 7;
                int end = json.IndexOfAny(new char[] { ',', '}' }, start);
                if (end > start) {
                    long msgTime;
                    if (long.TryParse(json.Substring(start, end - start).Trim(), out msgTime)) {
                        if (lastMessageTimestamp == 0) {
                            // Initial fetch - record baseline time without alerting
                            lastMessageTimestamp = msgTime;
                            return;
                        }

                        if (msgTime > lastMessageTimestamp) {
                            lastMessageTimestamp = msgTime;

                            // Extract sender and message text
                            string senderName = "Team Member";
                            string messageText = "New message";

                            int userIdx = json.LastIndexOf("\"user\":");
                            if (userIdx != -1) {
                                int uStart = json.IndexOf('"', userIdx + 7) + 1;
                                int uEnd = json.IndexOf('"', uStart);
                                if (uEnd > uStart) senderName = json.Substring(uStart, uEnd - uStart);
                            }

                            int textIdx = json.LastIndexOf("\"text\":");
                            if (textIdx != -1) {
                                int tStart = json.IndexOf('"', textIdx + 7) + 1;
                                int tEnd = json.IndexOf('"', tStart);
                                if (tEnd > tStart) messageText = json.Substring(tStart, tEnd - tStart);
                            }

                            // Trigger on UI thread
                            Dispatcher.Invoke(new Action(() => {
                                OnNewMessageReceived(senderName, messageText);
                            }));
                        }
                    }
                }
            }
        }

        private void OnNewMessageReceived(string user, string text) {
            unreadCount++;
            badgeText.Text = unreadCount > 99 ? "99+" : unreadCount.ToString();
            badgeBorder.Visibility = Visibility.Visible;

            // Subtle Bubble Bounce Animation
            ScaleTransform st = bubbleBorder.RenderTransform as ScaleTransform;
            if (st != null) {
                DoubleAnimation bounce = new DoubleAnimation(1.2, TimeSpan.FromMilliseconds(180)) {
                    AutoReverse = true,
                    RepeatBehavior = new RepeatBehavior(2)
                };
                st.BeginAnimation(ScaleTransform.ScaleXProperty, bounce);
                st.BeginAnimation(ScaleTransform.ScaleYProperty, bounce);
            }

            // Play clean system alert sound
            try {
                System.Media.SystemSounds.Asterisk.Play();
            } catch { }

            // Show floating Desktop Teaser Pill
            ShowDesktopTeaser(user, text);
        }

        // Persistence: Load & Save Bubble Desktop Position
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

        // Windows Auto-Start Registry Handling
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
