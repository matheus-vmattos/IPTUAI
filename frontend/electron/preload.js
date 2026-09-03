const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  escolherArquivoExcel: () => ipcRenderer.invoke('escolher-arquivo-excel'),
  escolherPasta: () => ipcRenderer.invoke('escolher-pasta'),
  abrirArquivo: (caminho) => ipcRenderer.invoke('abrir-arquivo', caminho),
});
