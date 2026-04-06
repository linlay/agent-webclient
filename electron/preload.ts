import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('__AGENT_WEBCLIENT_DESKTOP__', {
  isElectron: true,
  platform: process.platform,
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  },
});
