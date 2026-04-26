import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('sage', {
  platform: process.platform,
  isDev: !!process.env['ELECTRON_RENDERER_URL'],
});

export type SageBridge = {
  platform: NodeJS.Platform;
  isDev: boolean;
};

declare global {
  interface Window {
    sage: SageBridge;
  }
}
