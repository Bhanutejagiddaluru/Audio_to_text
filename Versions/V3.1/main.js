const { app, BrowserWindow, globalShortcut } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn, execFile, exec } = require("child_process");

let teleWindow;
let isRecording = false;
let ffmpegProcess;

// Folder paths
const fixedPath = path.join(app.getPath("downloads"), "interview_app");
const files = {
  audio: path.join(fixedPath, "output.wav"),
  text: path.join(fixedPath, "output.wav.txt"),
  whisperModel: path.join(fixedPath, "ggml-base.en.bin"),
  whisperBin: path.join(fixedPath, "whisper-cli.exe")
};

// -----------------------------
// 🔥 AUTO DETECT MICROPHONE (kept same, untouched)
// -----------------------------
async function detectMicrophone() {
  return new Promise((resolve) => {
    exec('ffmpeg -list_devices true -f dshow -i dummy', (err, stdout, stderr) => {
      const output = stderr.toString();

      const lines = output.split("\n");
      const audioDevices = lines.filter(l => l.includes("DirectShow audio devices") || l.includes("\""));

      let mic = null;

      for (const line of audioDevices) {
        const match = line.match(/"([^"]+)"/);
        if (match && match[1].toLowerCase().includes("microphone")) {
          mic = match[1];
          break;
        }
      }

      if (!mic) mic = "audio=default"; // fallback

      console.log("🎤 Using microphone:", mic);
      resolve(mic);
    });
  });
}

let micDevice = null;

// -----------------------------
// UI
// -----------------------------
function createWindows() {
  teleWindow = new BrowserWindow({
    width: 700,
    height: 500,
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  teleWindow.loadFile("index.html");
  teleWindow.setIgnoreMouseEvents(true, { forward: true });
}

function updateStatus(text) {
  teleWindow.webContents.send("status-update", text);
}

function showText(text) {
  teleWindow.webContents.send("show-text", text);
}

// -----------------------------
// 🎤 START RECORDING
// -----------------------------
function startRecording() {
  updateStatus('🔴 Recording...');
  teleWindow.webContents.send("mic-active");

  ffmpegProcess = spawn('ffmpeg', [
    '-y',
    '-f', 'dshow',

    // ❗ YOU SAID: DO NOT CHANGE THIS LINE
    '-i', 'audio=Microphone Array (Realtek(R) Audio)',

    '-ac', '2',
    '-ar', '44100',
    '-sample_fmt', 's16',
    files.audio
  ]);

  ffmpegProcess.stderr.on('data', () => {});
}

// -----------------------------
// 🛑 STOP → TRANSCRIBE
// -----------------------------
function stopRecording() {
  if (!ffmpegProcess) return;

  ffmpegProcess.on("exit", () => {
    ffmpegProcess = null;

    if (!fs.existsSync(files.audio)) {
      showText("❌ No audio recorded.");
      return;
    }

    const stats = fs.statSync(files.audio);
    if (stats.size < 1000) {
      showText("❌ Audio too short or silent.");
      return;
    }

    runWhisper();
  });

  ffmpegProcess.kill("SIGINT");
}

// -----------------------------
// 🤖 WHISPER
// -----------------------------
function runWhisper() {
  updateStatus("⚙️ Transcribing...");

  execFile(
    files.whisperBin,
    ["-otxt", "--no-timestamps", "-l", "en", "-m", files.whisperModel, "-f", files.audio],
    (err) => {
      if (err || !fs.existsSync(files.text)) {
        showText("❌ Whisper transcription failed.");
        updateStatus("❌ Error");
        return;
      }

      const text = fs.readFileSync(files.text, "utf8").trim();
      showText(text);
      updateStatus("✅ Done");
    }
  );
}

// -----------------------------
// APP INIT
// -----------------------------
app.whenReady().then(async () => {
  micDevice = await detectMicrophone();

  createWindows();

  globalShortcut.register("Control+Space", () => {
    if (!isRecording) {
      isRecording = true;
      startRecording();
    } else {
      isRecording = false;
      teleWindow.webContents.send("mic-inactive");
      stopRecording();
    }
  });
});
