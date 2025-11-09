import { useState, useEffect, useCallback, useRef } from 'react';
import { Editor } from './components/editor/Editor';
import { Toolbar } from './components/toolbar';

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
import { UnsavedChangesDialog } from './components/dialogs/UnsavedChangesDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from './components/ui/dropdown-menu';
import { Pencil, FolderOpen, Save, SaveAll, FileCode, FilePlus, X, LayoutGrid, Power } from 'lucide-react';
import { type Editor as TipTapEditor } from '@tiptap/react';
import logo from '/logo.png';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { exit } from '@tauri-apps/plugin-process';

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
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<'close' | 'quit' | 'open' | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Use ref to track current unsaved changes state for the close handler
  const hasUnsavedChangesRef = useRef(fileState.hasUnsavedChanges);
  const fileStateRef = useRef(fileState);
  const editorRef = useRef(editor);

  // Update refs whenever state changes
  useEffect(() => {
    hasUnsavedChangesRef.current = fileState.hasUnsavedChanges;
    fileStateRef.current = fileState;
  }, [fileState]);

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

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
          if (hasUnsavedChangesRef.current) {
            event.preventDefault();
            setPendingAction('close');
            setShowUnsavedDialog(true);
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
      // Check if there are unsaved changes
      if (fileState.hasUnsavedChanges) {
        setPendingAction('open');
        setShowUnsavedDialog(true);
        return;
      }

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

  const executeOpen = async () => {
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
      if (fileState.hasUnsavedChanges) {
        setPendingAction('close');
        setShowUnsavedDialog(true);
      } else {
        await closeCurrentWindow(false);
      }
    } catch (error) {
      console.error('Failed to close window:', error);
    }
  };

  const executeClose = async () => {
    // Clear unsaved changes flag BEFORE closing to prevent onCloseRequested from blocking
    hasUnsavedChangesRef.current = false;
    setFileState(prev => ({ ...prev, hasUnsavedChanges: false }));
    await windowManager.closeWindow(windowLabel);
    await windowManager.saveWindowSession();
    const currentWindow = getCurrentWebviewWindow();
    await currentWindow.close();
  };

  const executeQuit = async () => {
    // Clear unsaved changes flag BEFORE quitting
    hasUnsavedChangesRef.current = false;
    setFileState(prev => ({ ...prev, hasUnsavedChanges: false }));
    await windowManager.saveWindowSession();
    await exit(0);
  };

  const handleQuitApp = async () => {
    try {
      if (fileState.hasUnsavedChanges) {
        setPendingAction('quit');
        setShowUnsavedDialog(true);
      } else {
        await executeQuit();
      }
    } catch (error) {
      console.error('Failed to quit app:', error);
    }
  };

  const handleSave = async () => {
    try {
      // Get current content from editor
      const currentContent = editor?.getHTML() || fileState.content;
      const savedPath = await saveFile(currentContent, fileState.path);
      if (savedPath) {
        hasUnsavedChangesRef.current = false;
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
        hasUnsavedChangesRef.current = false;
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

  const handleContentChange = useCallback((newContent: string) => {
    setFileState(prev => ({
      ...prev,
      content: newContent,
      hasUnsavedChanges: prev.content !== newContent && (prev.path !== null || newContent !== ''),
    }));
  }, []);

  // Keyboard shortcuts (excluding undo/redo which TipTap handles natively)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        handleNewWindow();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
        e.preventDefault();
        handleCloseWindow();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'q') {
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
      } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
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
          className="flex items-center justify-between border-b border-ui-window bg-background py-2 px-4 min-h-14"
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
            <div className="w-px h-6 bg-border" />
            <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant={dropdownOpen ? 'default' : 'ghost'} size="sm" title="Window Controls" className="h-8 w-8 p-0">
                  <LayoutGrid className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={handleNewWindow}>
                  <FilePlus className="h-4 w-4 mr-2" />
                  New Window
                  <DropdownMenuShortcut>⌘N</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleOpen}>
                  <FolderOpen className="h-4 w-4 mr-2" />
                  Open File
                  <DropdownMenuShortcut>⌘O</DropdownMenuShortcut>
                </DropdownMenuItem>
                {/* <DropdownMenuItem onClick={handleOpenInNewWindow}>
                  <FolderOpen className="h-4 w-4 mr-2" />
                  Open in New Window
                  <DropdownMenuShortcut>⇧⌘O</DropdownMenuShortcut>
                </DropdownMenuItem> */}
                <DropdownMenuItem onClick={handleSave}>
                  <Save className="h-4 w-4 mr-2" />
                  Save
                  <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSaveAs}>
                  <SaveAll className="h-4 w-4 mr-2" />
                  Save As...
                  <DropdownMenuShortcut>⇧⌘S</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExport}>
                  <FileCode className="h-4 w-4 mr-2" />
                  Export
                  <DropdownMenuShortcut>⇧⌘E</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleCloseWindow}>
                  <X className="h-4 w-4 mr-2" />
                  Close Window
                  <DropdownMenuShortcut>⌘W</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleQuitApp}>
                  <Power className="h-4 w-4 mr-2" />
                  Quit App
                  <DropdownMenuShortcut>⌘Q</DropdownMenuShortcut>
                </DropdownMenuItem>
                {windowsMenu.length > 0 && <DropdownMenuSeparator />}
                {windowsMenu.map(win => (
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

      {/* Unsaved Changes Dialog */}
      <UnsavedChangesDialog
        open={showUnsavedDialog}
        onOpenChange={setShowUnsavedDialog}
        onDontSave={async () => {
          setShowUnsavedDialog(false);
          try {
            if (pendingAction === 'close') {
              await executeClose();
            } else if (pendingAction === 'quit') {
              await executeQuit();
            } else if (pendingAction === 'open') {
              await executeOpen();
            }
          } catch (error) {
            console.error('Error executing action:', error);
          } finally {
            setPendingAction(null);
          }
        }}
        onSave={async () => {
          setShowUnsavedDialog(false);
          try {
            await handleSave();
            if (pendingAction === 'close') {
              await executeClose();
            } else if (pendingAction === 'quit') {
              await executeQuit();
            } else if (pendingAction === 'open') {
              await executeOpen();
            }
          } catch (error) {
            console.error('Error executing action:', error);
          } finally {
            setPendingAction(null);
          }
        }}
        onCancel={() => {
          setShowUnsavedDialog(false);
          setPendingAction(null);
        }}
      />
    </div>
  );
}

export default App;
