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
    width: 700,
    height: 500,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  win.loadFile("index.html");
  win.setIgnoreMouseEvents(true, { forward: true });
}

function startListening() {
  if (streamProc) return;

  win.webContents.send("status-update", "🎙️ Listening…");
  win.webContents.send("mic-active");

  streamProc = spawn(streamExe, [
    "-m", modelPath,
    "--capture", "0",
    "-t", "4",
    "--step", "4000",
    "--length", "4000",
    "--keep", "100",
    "--vad-thold", "0.6",
    "--freq-thold", "100.00",
    "--beam-size", "1",
    "--max-tokens", "32",
    "--no-fallback",
    "--audio-ctx", "0",
    "--no-gpu",
  ], { cwd: modelDir });

  // Shared handler for stdout + stderr
  const handleChunk = (chunk) => {
    if (!chunk) return;

    let text = chunk.toString("utf8");

    // 1) Strip ANSI escape codes like ESC[2K
    text = text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");

    const lines = text.split(/\r?\n/);

    for (let raw of lines) {
      let l = raw.trim();
      if (!l) continue;

      // 2) Drop engine / log lines
      if (l.startsWith("init:")) continue;
      if (l.startsWith("SDL_main:")) continue;
      if (l.startsWith("whisper_")) continue;

      // 3) Drop BLANK_AUDIO markers
      if (l.includes("[BLANK_AUDIO]")) continue;

      // 4) Drop any line with no alphanumeric content
      if (!/[a-zA-Z0-9]/.test(l)) continue;

      // → Only real transcription reaches the UI
      win.webContents.send("append-text", l);
      // no console.log here (silent terminal)
    }
  };

  streamProc.stdout.setEncoding("utf8");
  streamProc.stderr.setEncoding("utf8");

  streamProc.stdout.on("data", handleChunk);
  streamProc.stderr.on("data", handleChunk);

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

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
