'use strict';
// Hidden helper window: receives image bytes from the main process, returns size/fingerprint/converted copy.
const { ipcRenderer } = require('electron');
const { reaperProcessImage } = require('./imageproc.js');

ipcRenderer.on('proc', async (e, msg) => {
  try {
    const result = await reaperProcessImage(msg.data, msg.mime, msg.opts);
    ipcRenderer.send('proc-done', { id: msg.id, result });
  } catch (err) {
    ipcRenderer.send('proc-done', { id: msg.id, error: String((err && err.message) || err) });
  }
});
