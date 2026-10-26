Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
strDir = FSO.GetParentFolderName(WScript.ScriptFullName)

WshShell.CurrentDirectory = strDir

' Check if launched in Boot mode (Session 0 without interactive user GUI)
isBoot = False
If WScript.Arguments.Count > 0 Then
    arg0 = LCase(WScript.Arguments(0))
    If InStr(arg0, "boot") > 0 Or InStr(arg0, "nobubble") > 0 Then
        isBoot = True
    End If
End If

' 1. Start server.exe silently
If FSO.FileExists(strDir & "\server.exe") Then
    WshShell.Run """" & strDir & "\server.exe""", 0, False
End If

' 2. Wait 2 seconds for server to bind port
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
    On Error Resume Next
    If FSO.FileExists(strLog) Then FSO.DeleteFile strLog, True
    On Error GoTo 0
    WshShell.Run """" & strCF & """ tunnel --url http://localhost:8080 --logfile """ & strLog & """", 0, False
End If

' 4. Start ZoneHub Floating Desktop Bubble on Windows screen (Only in interactive user session)
If Not isBoot Then
    strBubble = strDir & "\ZoneHubBubble.exe"
    If FSO.FileExists(strBubble) Then
        WshShell.Run """" & strBubble & """", 1, False
    End If
End If


