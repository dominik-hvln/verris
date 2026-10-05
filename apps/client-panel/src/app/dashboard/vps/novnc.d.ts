/**
 * Minimalne typy noVNC (pakiet nie ma własnych). API: https://github.com/novnc/noVNC/blob/master/docs/API.md
 */
declare module '@novnc/novnc' {
  export default class RFB extends EventTarget {
    constructor(target: HTMLElement, urlOrChannel: string, options?: { credentials?: { password?: string } });
    scaleViewport: boolean;
    resizeSession: boolean;
    disconnect(): void;
    sendCtrlAltDel(): void;
  }
}
