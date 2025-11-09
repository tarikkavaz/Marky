import { WebviewWindow, getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { invoke } from '@tauri-apps/api/core';

interface WindowInfo {
  label: string;
  filePath: string | null;
  title: string;
}

class WindowManager {
  private static instance: WindowManager;
  private windows: Map<string, WindowInfo> = new Map();

  private constructor() {
    this.loadWindowsFromBackend();
  }

  public static getInstance(): WindowManager {
    if (!WindowManager.instance) {
      WindowManager.instance = new WindowManager();
    }
    return WindowManager.instance;
  }

  private async loadWindowsFromBackend() {
    try {
      const windows = await invoke<WindowInfo[]>('get_all_windows');
      windows.forEach(win => {
        this.windows.set(win.label, win);
      });
    } catch (error) {
      console.error('Failed to load windows from backend:', error);
    }
  }

  public async createWindow(filePath: string | null, _content: string = ''): Promise<string | null> {
    try {
      // Check if file is already open
      if (filePath && this.isFileOpen(filePath)) {
        const windowLabel = this.getWindowLabelByFilePath(filePath);
        if (windowLabel) {
          await this.focusWindow(windowLabel);
          return null;
        }
      }

      const label = `window-${Date.now()}`;
      const title = filePath ? this.getFilenameFromPath(filePath) : 'Untitled';

      // Create window using Tauri API
      const webviewWindow = new WebviewWindow(label, {
        url: filePath
          ? `/?file=${encodeURIComponent(filePath)}`
          : '/',
        title,
        width: 800,
        height: 1000,
        decorations: false,
        transparent: true,
        center: true,
        resizable: true,
      });

      // Wait for window to be created
      await new Promise((resolve, reject) => {
        webviewWindow.once('tauri://created', () => {
          resolve(true);
        });
        webviewWindow.once('tauri://error', (e) => {
          reject(e);
        });
      });

      // Register window
      const windowInfo: WindowInfo = { label, filePath, title };
      this.windows.set(label, windowInfo);
      await invoke('register_window', { label, filePath, title });

      return label;
    } catch (error) {
      console.error('Failed to create window:', error);
      return null;
    }
  }

  public async closeWindow(label: string) {
    try {
      this.windows.delete(label);
      await invoke('unregister_window', { label });
    } catch (error) {
      console.error('Failed to close window:', error);
    }
  }

  public isFileOpen(filePath: string): boolean {
    return Array.from(this.windows.values()).some(
      win => win.filePath === filePath
    );
  }

  public getWindowLabelByFilePath(filePath: string): string | null {
    for (const [label, info] of this.windows.entries()) {
      if (info.filePath === filePath) {
        return label;
      }
    }
    return null;
  }

  public async focusWindow(label: string) {
    try {
      const webviewWindow = await WebviewWindow.getByLabel(label);
      if (webviewWindow) {
        await webviewWindow.setFocus();
        await webviewWindow.show();
      }
    } catch (error) {
      console.error('Failed to focus window:', error);
    }
  }

  public async updateWindowTitle(label: string, filePath: string | null) {
    try {
      const title = filePath ? this.getFilenameFromPath(filePath) : 'Untitled';
      const webviewWindow = await WebviewWindow.getByLabel(label);
      if (webviewWindow) {
        await webviewWindow.setTitle(title);
      }
      
      const windowInfo = this.windows.get(label);
      if (windowInfo) {
        windowInfo.filePath = filePath;
        windowInfo.title = title;
        await invoke('update_window_info', { label, filePath, title });
      }
    } catch (error) {
      console.error('Failed to update window title:', error);
    }
  }

  public getAllWindows(): WindowInfo[] {
    return Array.from(this.windows.values());
  }

  private getFilenameFromPath(path: string): string {
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1];
  }

  public async saveWindowSession() {
    try {
      const session = Array.from(this.windows.values())
        .filter(win => win.filePath !== null)
        .map(win => win.filePath);
      await invoke('save_window_session', { filePaths: session });
    } catch (error) {
      console.error('Failed to save window session:', error);
    }
  }

  public async restoreWindowSession() {
    try {
      const filePaths = await invoke<string[]>('load_window_session');
      for (const filePath of filePaths) {
        await this.createWindow(filePath);
      }
    } catch (error) {
      console.error('Failed to restore window session:', error);
    }
  }
}

export const windowManager = WindowManager.getInstance();

export async function getCurrentWindowLabel(): Promise<string> {
  const currentWindow = getCurrentWebviewWindow();
  return currentWindow.label;
}

export async function closeCurrentWindow(hasUnsavedChanges: boolean): Promise<boolean> {
  const currentWindow = getCurrentWebviewWindow();
  
  if (hasUnsavedChanges) {
    // Show confirmation dialog
    const confirmed = await invoke<boolean>('show_close_confirmation');
    if (!confirmed) {
      return false;
    }
  }

  await windowManager.closeWindow(currentWindow.label);
  await currentWindow.close();
  return true;
}

