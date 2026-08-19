const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { autoUpdater } = require('electron-updater');

let mainWindow;

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

ipcMain.handle('print-window', () => {
  mainWindow.webContents.print({ silent: false, printBackground: true });
});

// Recebe o PDF (base64) ja baixado pelo renderer com o token de auth,
// grava em um arquivo temporario e abre uma janela oculta so para
// disparar o dialogo de impressao nativo do PDF.
ipcMain.handle('print-pdf', async (event, base64) => {
  const tmpPath = path.join(os.tmpdir(), `iptuai-print-${crypto.randomUUID()}.pdf`);
  fs.writeFileSync(tmpPath, Buffer.from(base64, 'base64'));

  const printWin = new BrowserWindow({
    show: false,
    webPreferences: { plugins: true },
  });

  try {
    await printWin.loadFile(tmpPath);
    await new Promise((resolve, reject) => {
      printWin.webContents.print({ silent: false, printBackground: true }, (success, reason) => {
        if (success) resolve();
        else reject(new Error(reason));
      });
    });
  } finally {
    printWin.close();
    fs.unlink(tmpPath, () => {});
  }
});

app.whenReady().then(() => {
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
