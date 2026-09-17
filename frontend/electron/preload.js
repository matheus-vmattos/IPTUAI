const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  escolherArquivoExcel: () => ipcRenderer.invoke('escolher-arquivo-excel'),
  escolherPasta: () => ipcRenderer.invoke('escolher-pasta'),
  abrirArquivo: (caminho) => ipcRenderer.invoke('abrir-arquivo', caminho),
  exportarPDF: (html, nomeArquivoSugerido) => ipcRenderer.invoke('exportar-pdf', { html, nomeArquivoSugerido }),

  versaoApp: () => ipcRenderer.invoke('versao-app'),
  verificarAtualizacoes: () => ipcRenderer.invoke('verificar-atualizacoes'),
  instalarAtualizacao: () => ipcRenderer.invoke('instalar-atualizacao'),
  onUpdateStatus: (callback) => {
    const handler = (event, status) => callback(status);
    ipcRenderer.on('update-status', handler);
    return () => ipcRenderer.removeListener('update-status', handler);
  },
});
