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
      // Sem isso, um app EMPACOTADO tenta abrir outra instancia do proprio
      // Electron.exe ao dar fork (o binario do app tambem e o "node" usado
      // pra rodar o backend) - o backend nunca sobe e todo request do
      // renderer falha com "Network Error". Em dev isso nao aparece porque
      // o processo pai ja roda via `electron .`, nao o .exe empacotado.
      ELECTRON_RUN_AS_NODE: '1',
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

function waitForBackend(timeoutMs = 25000) {
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

// Gera um PDF a partir de um HTML montado no renderer (relatorios como o
// resumo do proprietario): renderiza numa janela oculta e imprime pra PDF,
// depois deixa o usuario escolher onde salvar.
ipcMain.handle('exportar-pdf', async (event, { html, nomeArquivoSugerido }) => {
  const janelaImpressao = new BrowserWindow({ show: false });
  try {
    await janelaImpressao.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);
    const pdfBuffer = await janelaImpressao.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
    });

    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Salvar PDF',
      defaultPath: nomeArquivoSugerido || 'relatorio.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (result.canceled || !result.filePath) return { salvo: false };

    await fs.promises.writeFile(result.filePath, pdfBuffer);
    return { salvo: true, caminho: result.filePath };
  } finally {
    janelaImpressao.close();
  }
});

// --- Versao / auto-update ---------------------------------------------
// checkForUpdatesAndNotify() (usado antes) baixa e notifica sozinho via
// notificacao nativa do SO, sem dar controle nenhum pro app. Aqui o
// autoUpdater roda "manual": o renderer pede a verificacao e recebe cada
// evento (baixando, progresso, pronto pra instalar...) pra mostrar na tela
// de Configuracoes. autoInstallOnAppQuit continua true pra quem nunca
// clica em "reiniciar e instalar" tambem receber a atualizacao sozinho
// (ela e aplicada no proximo fechar+abrir do app).
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

function enviarStatusAtualizacao(status) {
  mainWindow?.webContents.send('update-status', status);
}

autoUpdater.on('checking-for-update', () => enviarStatusAtualizacao({ estado: 'verificando' }));
autoUpdater.on('update-available', (info) =>
  enviarStatusAtualizacao({ estado: 'disponivel', versao: info.version })
);
autoUpdater.on('update-not-available', () => enviarStatusAtualizacao({ estado: 'atualizado' }));
autoUpdater.on('download-progress', (progresso) =>
  enviarStatusAtualizacao({ estado: 'baixando', percentual: Math.round(progresso.percent) })
);
autoUpdater.on('update-downloaded', (info) =>
  enviarStatusAtualizacao({ estado: 'pronto', versao: info.version })
);
autoUpdater.on('error', (err) => enviarStatusAtualizacao({ estado: 'erro', mensagem: err.message }));

ipcMain.handle('verificar-atualizacoes', async () => {
  if (!app.isPackaged) {
    enviarStatusAtualizacao({ estado: 'erro', mensagem: 'Só funciona no app instalado, não em desenvolvimento.' });
    return;
  }
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    enviarStatusAtualizacao({ estado: 'erro', mensagem: err.message });
  }
});

ipcMain.handle('instalar-atualizacao', () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle('versao-app', () => app.getVersion());

app.whenReady().then(async () => {
  startBackend();
  const backendOk = await waitForBackend();
  createWindow();

  if (!backendOk) {
    dialog.showErrorBox(
      'IPTUAI',
      'O app demorou demais pra iniciar o servidor local. Feche e abra o IPTUAI de novo - ' +
        'costuma resolver, principalmente logo depois de uma atualização. Se continuar ' +
        'acontecendo, me avise.'
    );
  }

  if (app.isPackaged) {
    autoUpdater.checkForUpdates().catch(() => {});
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
