import { useState, useEffect, useCallback } from 'react';
import { Editor } from './components/Editor';
import { Toolbar } from './components/Toolbar';

import {
  openFile,
  saveFile,
  saveFileAs,
  exportToHTMLFile,
  loadFileFromPath,
  type FileState,
} from './lib/fileOperations';
import { windowManager, getCurrentWindowLabel, closeCurrentWindow } from './lib/windowManager';
import { Button } from './components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from './components/ui/dropdown-menu';
import { Pencil, FolderOpen, Save, SaveAll, FileCode, FilePlus, X, LayoutGrid } from 'lucide-react';
import { type Editor as TipTapEditor } from '@tiptap/react';
import logo from '/logo.png';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

function App() {
  const [fileState, setFileState] = useState<FileState>({
    path: null,
    content: '',
    hasUnsavedChanges: false,
  });

  const [showToolbar, setShowToolbar] = useState(false);
  const [editor, setEditor] = useState<TipTapEditor | null>(null);
  const [windowLabel, setWindowLabel] = useState<string>('');
  const [windowsMenu, setWindowsMenu] = useState<Array<{ label: string; title: string }>>([]);

  // Initialize window and load file from URL params
  useEffect(() => {
    async function initWindow() {
      try {
        const label = await getCurrentWindowLabel();
        setWindowLabel(label);

        // Register this window
        const currentWindow = getCurrentWebviewWindow();
        await windowManager.updateWindowTitle(label, null);

        // Check if file path is passed via URL params
        const params = new URLSearchParams(window.location.search);
        const filePath = params.get('file');
        const isRestore = params.get('restore') === 'true';
        
        if (filePath) {
          // Load file from path
          const result = await loadFileFromPath(filePath);
          if (result) {
            setFileState({
              path: result.path,
              content: result.content,
              hasUnsavedChanges: false,
            });
            await windowManager.updateWindowTitle(label, result.path);
          }
        } else if (!isRestore && label === 'main') {
          // Only restore session on the main window and if not already restoring
          await windowManager.restoreWindowSession();
        }

        // Setup close request handler
        await currentWindow.onCloseRequested(async (event) => {
          if (fileState.hasUnsavedChanges) {
            event.preventDefault();
            const shouldClose = await closeCurrentWindow(true);
            if (shouldClose) {
              await windowManager.saveWindowSession();
              await currentWindow.close();
            }
          } else {
            await windowManager.closeWindow(label);
            await windowManager.saveWindowSession();
          }
        });

        // Update windows menu periodically
        updateWindowsMenu();
        const interval = setInterval(updateWindowsMenu, 2000);
        return () => clearInterval(interval);
      } catch (error) {
        console.error('Failed to initialize window:', error);
      }
    }

    initWindow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateWindowsMenu = async () => {
    const windows = windowManager.getAllWindows();
    setWindowsMenu(
      windows.map(win => ({
        label: win.label,
        title: win.title,
      }))
    );
  };

  const handleOpen = async () => {
    try {
      const result = await openFile();
      if (result) {
        setFileState({
          path: result.path,
          content: result.content,
          hasUnsavedChanges: false,
        });
        // Update window title
        if (windowLabel) {
          await windowManager.updateWindowTitle(windowLabel, result.path);
        }
      }
    } catch (error) {
      console.error('Failed to open file:', error);
    }
  };

  const handleOpenInNewWindow = async () => {
    try {
      const result = await openFile();
      if (result) {
        await windowManager.createWindow(result.path, result.content);
      }
    } catch (error) {
      console.error('Failed to open file in new window:', error);
    }
  };

  const handleNewWindow = async () => {
    try {
      await windowManager.createWindow(null);
    } catch (error) {
      console.error('Failed to create new window:', error);
    }
  };

  const handleCloseWindow = async () => {
    try {
      await closeCurrentWindow(fileState.hasUnsavedChanges);
    } catch (error) {
      console.error('Failed to close window:', error);
    }
  };

  const handleSave = async () => {
    try {
      // Get current content from editor
      const currentContent = editor?.getHTML() || fileState.content;
      const savedPath = await saveFile(currentContent, fileState.path);
      if (savedPath) {
        setFileState(prev => ({
          ...prev,
          path: savedPath,
          content: currentContent,
          hasUnsavedChanges: false,
        }));
        // Update window title
        if (windowLabel) {
          await windowManager.updateWindowTitle(windowLabel, savedPath);
        }
      }
    } catch (error) {
      console.error('Failed to save file:', error);
    }
  };

  const handleSaveAs = async () => {
    try {
      // Get current content from editor
      const currentContent = editor?.getHTML() || fileState.content;
      const savedPath = await saveFileAs(currentContent);
      if (savedPath) {
        setFileState(prev => ({
          ...prev,
          path: savedPath,
          content: currentContent,
          hasUnsavedChanges: false,
        }));
        // Update window title
        if (windowLabel) {
          await windowManager.updateWindowTitle(windowLabel, savedPath);
        }
      }
    } catch (error) {
      console.error('Failed to save file as:', error);
    }
  };

  const handleExport = async () => {
    try {
      // Get current content from editor
      const currentContent = editor?.getHTML() || fileState.content;
      await exportToHTMLFile(currentContent);
    } catch (error) {
      console.error('Failed to export to HTML:', error);
    }
  };

  const handleContentChange = useCallback(
    (newContent: string) => {
      setFileState(prev => ({
        ...prev,
        content: newContent,
        hasUnsavedChanges: prev.content !== newContent && (prev.path !== null || newContent !== ''),
      }));
    },
    []
  );


  // Keyboard shortcuts (excluding undo/redo which TipTap handles natively)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        handleNewWindow();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
        e.preventDefault();
        handleCloseWindow();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
        e.preventDefault();
        if (e.shiftKey) {
          handleOpenInNewWindow();
        } else {
          handleOpen();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (e.shiftKey) {
          handleSaveAs();
        } else {
          handleSave();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        handleExport();
      }
      // Note: Cmd+Z (undo) and Cmd+Shift+Z (redo) are handled natively by TipTap
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileState.hasUnsavedChanges]);

  return (
    <div className="w-screen h-screen bg-background text-foreground">
      <div className="flex flex-col w-full h-full rounded-2xl shadow-2xl overflow-hidden">
        {/* Header with native window controls */}
        <header
          className="flex items-center justify-between border-b border-ui-window bg-background py-2 px-4 min-h-14 pl-20"
          data-tauri-drag-region
        >
          <div className="flex items-center gap-2" data-tauri-drag-region>
            <img src={logo} alt="Marky" className="size-7" data-tauri-drag-region />
            <span
              className="text-lg font-semibold text-foreground select-none cursor-default"
              data-tauri-drag-region
            >
              Marky
            </span>
          </div>
          <div className="flex-1 flex items-center justify-center" data-tauri-drag-region>
            <span
              className="text-sm text-muted-foreground select-none cursor-default"
              data-tauri-drag-region
            >
              {fileState.path
                ? fileState.path.split(/[/\\]/).pop()
                : 'Untitled'}
            </span>
          </div>
          <div className="flex items-center gap-2" data-tauri-drag-region>
            <Button
              variant={showToolbar ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setShowToolbar(!showToolbar)}
              title="Toggle Toolbar"
              className="h-8 w-8 p-0"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <div className="w-px h-6 bg-border" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  title="Window Controls"
                  className="h-8 w-8 p-0"
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleNewWindow}>
                  <FilePlus className="h-4 w-4 mr-2" />
                  New Window
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleOpen}>
                  <FolderOpen className="h-4 w-4 mr-2" />
                  Open
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleOpenInNewWindow}>
                  <FolderOpen className="h-4 w-4 mr-2" />
                  Open in New Window
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExport}>
                  <FileCode className="h-4 w-4 mr-2" />
                  Export
                </DropdownMenuItem>
                {windowsMenu.length > 0 && <DropdownMenuSeparator />}
                {windowsMenu.map((win) => (
                  <DropdownMenuItem
                    key={win.label}
                    onClick={() => windowManager.focusWindow(win.label)}
                    className={win.label === windowLabel ? 'bg-accent' : ''}
                  >
                    {win.title}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="w-px h-6 bg-border" />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSave}
              disabled={!fileState.path && !fileState.hasUnsavedChanges}
              title={fileState.hasUnsavedChanges ? 'Unsaved changes (Cmd+S)' : 'Save (Cmd+S)'}
              className={`h-8 w-8 p-0 ${
                fileState.hasUnsavedChanges ? 'animate-blink-outline' : ''
              }`}
            >
              <Save className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSaveAs}
              title="Save As (Cmd+Shift+S)"
              className="h-8 w-8 p-0"
            >
              <SaveAll className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCloseWindow}
              title="Close Window (Cmd+W)"
              className="h-8 w-8 p-0 hidden"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* Toolbar */}
        {showToolbar && <Toolbar editor={editor} currentFilePath={fileState.path} />}

        {/* Editor area */}
        <main className="flex-1 overflow-hidden bg-background/70">
          <Editor
            content={fileState.content}
            onChange={handleContentChange}
            onEditorReady={setEditor}
            currentFilePath={fileState.path}
          />
        </main>
      </div>
    </div>
  );
}

export default App;
