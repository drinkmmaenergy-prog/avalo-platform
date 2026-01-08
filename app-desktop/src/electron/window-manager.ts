import { BrowserWindow, screen, app } from 'electron';
import path from 'path';

interface WindowOptions {
  url: string;
  title: string;
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
  parent?: BrowserWindow;
  modal?: boolean;
}

export class WindowManager {
  private windows: Map<string, BrowserWindow> = new Map();
  private mainWindow: BrowserWindow | null = null;

  async initialize(): Promise<void> {
    console.log('WindowManager initialized');
  }

  createMainWindow(options: WindowOptions): BrowserWindow {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

    const x = Math.round((screenWidth - options.width) / 2);
    const y = Math.round((screenHeight - options.height) / 2);

    this.mainWindow = new BrowserWindow({
      x,
      y,
      width: options.width,
      height: options.height,
      minWidth: options.minWidth || 1024,
      minHeight: options.minHeight || 768,
      title: options.title,
      icon: path.join(__dirname, '../../build/icon.png'),
      backgroundColor: '#000000',
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        nodeIntegrationInSubFrames: false,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        enableRemoteModule: false,
        worldSafeExecuteJavaScript: true,
        spellcheck: true,
        devTools: process.env.NODE_ENV === 'development'
      },
      frame: true,
      titleBarStyle: 'default',
      autoHideMenuBar: true
    });

    this.mainWindow.loadURL(options.url);

    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.show();
      this.mainWindow?.focus();
    });

    this.mainWindow.on('closed', () => {
      this.windows.delete('main');
      this.mainWindow = null;
    });

    this.windows.set('main', this.mainWindow);

    return this.mainWindow;
  }

  createChildWindow(id: string, options: WindowOptions): BrowserWindow {
    if (this.windows.has(id)) {
      const existingWindow = this.windows.get(id);
      existingWindow?.focus();
      return existingWindow!;
    }

    const childWindow = new BrowserWindow({
      width: options.width,
      height: options.height,
      minWidth: options.minWidth,
      minHeight: options.minHeight,
      title: options.title,
      parent: options.parent || this.mainWindow || undefined,
      modal: options.modal || false,
      backgroundColor: '#000000',
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        devTools: process.env.NODE_ENV === 'development'
      },
      autoHideMenuBar: true
    });

    childWindow.loadURL(options.url);

    childWindow.once('ready-to-show', () => {
      childWindow.show();
    });

    childWindow.on('closed', () => {
      this.windows.delete(id);
    });

    this.windows.set(id, childWindow);

    return childWindow;
  }

  createSplitWindow(id: string, layout: 'horizontal' | 'vertical'): BrowserWindow[] {
    if (!this.mainWindow) {
      throw new Error('Main window must exist before creating split windows');
    }

    const bounds = this.mainWindow.getBounds();
    const windows: BrowserWindow[] = [];

    if (layout === 'horizontal') {
      const halfWidth = Math.floor(bounds.width / 2);

      const leftWindow = this.createChildWindow(`${id}-left`, {
        url: 'about:blank',
        title: 'Left Panel',
        width: halfWidth,
        height: bounds.height,
        parent: this.mainWindow
      });

      leftWindow.setBounds({
        x: bounds.x,
        y: bounds.y,
        width: halfWidth,
        height: bounds.height
      });

      const rightWindow = this.createChildWindow(`${id}-right`, {
        url: 'about:blank',
        title: 'Right Panel',
        width: halfWidth,
        height: bounds.height,
        parent: this.mainWindow
      });

      rightWindow.setBounds({
        x: bounds.x + halfWidth,
        y: bounds.y,
        width: halfWidth,
        height: bounds.height
      });

      windows.push(leftWindow, rightWindow);
    } else {
      const halfHeight = Math.floor(bounds.height / 2);

      const topWindow = this.createChildWindow(`${id}-top`, {
        url: 'about:blank',
        title: 'Top Panel',
        width: bounds.width,
        height: halfHeight,
        parent: this.mainWindow
      });

      topWindow.setBounds({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: halfHeight
      });

      const bottomWindow = this.createChildWindow(`${id}-bottom`, {
        url: 'about:blank',
        title: 'Bottom Panel',
        width: bounds.width,
        height: halfHeight,
        parent: this.mainWindow
      });

      bottomWindow.setBounds({
        x: bounds.x,
        y: bounds.y + halfHeight,
        width: bounds.width,
        height: halfHeight
      });

      windows.push(topWindow, bottomWindow);
    }

    return windows;
  }

  getWindow(id: string): BrowserWindow | undefined {
    return this.windows.get(id);
  }

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  getAllWindows(): BrowserWindow[] {
    return Array.from(this.windows.values());
  }

  closeWindow(id: string): void {
    const window = this.windows.get(id);
    if (window && !window.isDestroyed()) {
      window.close();
    }
  }

  closeAllWindows(): void {
    this.windows.forEach((window, id) => {
      if (id !== 'main' && !window.isDestroyed()) {
        window.close();
      }
    });
  }

  focusWindow(id: string): void {
    const window = this.windows.get(id);
    if (window && !window.isDestroyed()) {
      if (window.isMinimized()) {
        window.restore();
      }
      window.focus();
    }
  }

  minimizeAll(): void {
    this.windows.forEach(window => {
      if (!window.isDestroyed() && !window.isMinimized()) {
        window.minimize();
      }
    });
  }

  restoreAll(): void {
    this.windows.forEach(window => {
      if (!window.isDestroyed() && window.isMinimized()) {
        window.restore();
      }
    });
  }

  cleanup(): void {
    this.closeAllWindows();
    this.windows.clear();
    this.mainWindow = null;
  }
}