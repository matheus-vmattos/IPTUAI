const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { fork } = require('child_process');
const { autoUpdater } = require('electron-updater');

const BACKEND_PORT = 4317;

let mainWindow;
let backendProcess;

function backendEntryPoint() {
  // Em dev, o backend mora ao lado do frontend no monorepo. Empacotado, o
  // electron-builder copia backend/ inteiro (código + node_modules) para
  // dentro de resources/backend (ver "extraResources" no package.json).
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'backend', 'src', 'server.js');
  }
  return path.join(__dirname, '..', '..', 'backend', 'src', 'server.js');
}

function startBackend() {
  const entry = backendEntryPoint();
  if (!fs.existsSync(entry)) {
    console.error(`Backend não encontrado em ${entry}`);
    return;
  }

  backendProcess = fork(entry, [], {
    env: {
      ...process.env,
      PORT: String(BACKEND_PORT),
      CONFIG_PATH: path.join(app.getPath('userData'), 'config.json'),
    },
    silent: true,
  });

  backendProcess.stdout?.on('data', (d) => console.log(`[backend] ${d}`.trim()));
  backendProcess.stderr?.on('data', (d) => console.error(`[backend] ${d}`.trim()));
  backendProcess.on('exit', (code) => {
    if (code && code !== 0) console.error(`Backend encerrou com código ${code}`);
  });
}

function waitForBackend(timeoutMs = 8000) {
  const start = Date.now();
  return new Promise((resolve) => {
    (function tentar() {
      const req = http.get(`http://127.0.0.1:${BACKEND_PORT}/health`, (res) => {
        res.resume();
        resolve(true);
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) return resolve(false);
        setTimeout(tentar, 200);
      });
    })();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

ipcMain.handle('escolher-arquivo-excel', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Selecione a planilha do IPTU',
    properties: ['openFile'],
    filters: [{ name: 'Planilha Excel', extensions: ['xlsx'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('escolher-pasta', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Selecione a pasta para salvar os carnês',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('abrir-arquivo', async (event, caminho) => {
  const erro = await shell.openPath(caminho);
  if (erro) throw new Error(erro);
});

app.whenReady().then(async () => {
  startBackend();
  await waitForBackend();
  createWindow();

  if (!process.env.VITE_DEV_SERVER_URL) {
    autoUpdater.checkForUpdatesAndNotify();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  backendProcess?.kill();
});
