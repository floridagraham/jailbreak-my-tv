// The double-click button for Windows. It only opens installer\start.cmd, and exists because a .cmd file can't carry its own icon.
// Build, from this folder, with the compiler Windows already has:
//   C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /nologo /target:winexe /win32icon:edison.ico "/out:..\Jailbreak My TV.exe" launcher.cs
using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

static class Launcher {
  static void Main() {
    string start = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "installer", "start.cmd");
    if (!File.Exists(start)) {
      MessageBox.Show("Unzip the whole download first, then double-click Jailbreak My TV in the unzipped folder.", "Jailbreak My TV");
      return;
    }
    Process.Start(new ProcessStartInfo(start) { UseShellExecute = true, WorkingDirectory = Path.GetDirectoryName(start) });
  }
}
