const { app, BrowserWindow, globalShortcut } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

let win;
let streamProc = null;

const modelDir = path.join(process.env.USERPROFILE, "Downloads", "interview_app");
const streamExe = path.join(modelDir, "whisper-stream.exe");
const modelPath = path.join(modelDir, "ggml-base.en.bin");

function createWindow() {
  win = new BrowserWindow({
    width: 700, height: 500,
    transparent: true, frame: false,
    alwaysOnTop: true, skipTaskbar: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });
  win.loadFile("index.html");
  win.setIgnoreMouseEvents(true, { forward: true });
}

function startListening() {
  if (streamProc) return;
  win.webContents.send("status-update", "🎙️ Listening…");
  win.webContents.send("mic-active");

  // Better #1
  // streamProc = spawn(streamExe, [
  //     "-m", modelPath,
  //     "--capture", "0",
  //     "--step", "1500",
  //     "--length", "5000",
  //     "--keep", "200",
  //     "--vad-thold", "0.35"
  //   ], { cwd: modelDir });



    // streamProc = spawn(streamExe, [
    //   "-m", modelPath,
    //   "--capture", "0",
    //   "--step", "3000",          // best compromise
    //   "--length", "5000",        // cleanest output
    //   "--keep", "200",           // minimal overlap → no repeats
    //   "--vad-thold", "0.6",     // easier VAD
    //   "--freq-thold", "100.00",      // keep low-frequency speech
    //   "--max-tokens", "32",      // prevents hallucinations
    //   "--no-fallback",
    //   "--no-gpu"
    // ], { cwd: modelDir });

    streamProc = spawn(streamExe, [
      "-m", modelPath,
      "--capture", "0",
      "-t", "4",               // Performance: Uses all 4 cores
      "--step", "4000",        // 5s Step: High latency, but High Accuracy
      "--length", "4000",      // Equal to Step: Kills the "echo" completely
      "--keep", "100",           // Critical: Prevents "returns return" glitches
      "--vad-thold", "0.6",    // Good balance for catching soft starts
      "--freq-thold", "100.00",// Keeps natural voice depth
      "--beam-size", "1",      // Greedy search (Fastest)
      "--max-tokens", "32",    // Increased to 64: Prevents cutting off the end of the 5s sentence
      "--no-fallback",
      "--audio-ctx", "0",
      "--no-gpu"
    ], { cwd: modelDir });
    


  streamProc.stdout.setEncoding("utf8");
  streamProc.stdout.on("data", d => {
    const lines = d.toString().split("\n");
    for (let l of lines) {
      l = l.trim();
      if (!l) continue;
      // whisper-stream prints plain text lines on speech detection
      win.webContents.send("append-text", l);
      console.log("»", l);
    }
  });

  streamProc.stderr.on("data", d => console.warn("whisper-stream err:", d.toString()));
  streamProc.on("exit", () => {
    streamProc = null;
    win.webContents.send("status-update", "Ready");
    win.webContents.send("mic-inactive");
  });
}

function stopListening() {
  if (streamProc) {
    streamProc.kill("SIGINT");
    streamProc = null;
  }
  win.webContents.send("status-update", "Stopped");
  win.webContents.send("mic-inactive");
}

app.whenReady().then(() => {
  createWindow();
  globalShortcut.register("Control+Space", () => {
    if (!streamProc) startListening();
    else stopListening();
  });
});

app.on("will-quit", () => globalShortcut.unregisterAll());
