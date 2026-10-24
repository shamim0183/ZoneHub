Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
strDir = FSO.GetParentFolderName(WScript.ScriptFullName)

WshShell.CurrentDirectory = strDir

' 1. Start server.exe silently
WshShell.Run """" & strDir & "\server.exe""", 0, False

' 2. Wait 2 seconds for server to start
WScript.Sleep 2000

' 3. Start Cloudflare Online Tunnel silently
strCF = strDir & "\cloudflared.exe"
If Not FSO.FileExists(strCF) Then
    strCF = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
End If
If Not FSO.FileExists(strCF) Then
    strCF = "C:\Program Files\cloudflared\cloudflared.exe"
End If

If FSO.FileExists(strCF) Then
    strLog = strDir & "\cloudflared.log"
    WshShell.Run """" & strCF & """ tunnel --url http://localhost:8080 --logfile """ & strLog & """", 0, False
End If
