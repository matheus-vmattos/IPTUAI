const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  printWindow: () => ipcRenderer.invoke('print-window'),
  printPdfBuffer: (base64) => ipcRenderer.invoke('print-pdf', base64),
});
