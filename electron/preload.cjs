'use strict';

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('ifexDesktop', Object.freeze({
  isDesktop: true,
  platform: process.platform,
}));
