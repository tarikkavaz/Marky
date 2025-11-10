import { useState, useEffect, useCallback, useRef } from 'react';
import { Editor } from './components/editor/Editor';
import { Toolbar } from './components/toolbar';

import {
  openFile,
  saveFile,
  saveFileAs,
  exportToHTMLFile,
  loadFileFromPath,
  htmlToMarkdown,
  markdownToHTML,
  type FileState,
} from './lib/fileOperations';
import { windowManager, getCurrentWindowLabel, closeCurrentWindow } from './lib/windowManager';
import { startWatching, stopWatching, onFileChanged, onFileDeleted } from './lib/fileWatcher';
import { Button } from './components/ui/button';
import { UnsavedChangesDialog } from './components/dialogs/UnsavedChangesDialog';
import { ExternalFileChangeDialog } from './components/dialogs/ExternalFileChangeDialog';
import { HelpDialog } from './components/dialogs/HelpDialog';
import { AboutDialog } from './components/dialogs/AboutDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from './components/ui/dropdown-menu';
import { Pencil, FolderOpen, Save, SaveAll, FileCode, FilePlus, X, LayoutGrid, Power, Code } from 'lucide-react';
import { type Editor as TipTapEditor } from '@tiptap/react';
import logo from '/logo.png';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { exit } from '@tauri-apps/plugin-process';
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { listen } from '@tauri-apps/api/event';

function App() {
  const [fileState, setFileState] = useState<FileState>({
    path: null,
    content: '',
    hasUnsavedChanges: false,
  });

  const [showToolbar, setShowToolbar] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [markdownContent, setMarkdownContent] = useState<string>('');
  const [editor, setEditor] = useState<TipTapEditor | null>(null);
  const [windowLabel, setWindowLabel] = useState<string>('');
  const [windowsMenu, setWindowsMenu] = useState<Array<{ label: string; title: string }>>([]);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<'close' | 'quit' | 'open' | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showExternalChangeDialog, setShowExternalChangeDialog] = useState(false);
  const [externalChangeFilePath, setExternalChangeFilePath] = useState<string | null>(null);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [showAboutDialog, setShowAboutDialog] = useState(false);
  
  // Refs for file watcher cleanup
  const fileChangeUnlistenRef = useRef<(() => void) | null>(null);
  const fileDeleteUnlistenRef = useRef<(() => void) | null>(null);
  // Track when we last saved to ignore immediate file change events
  const lastSaveTimeRef = useRef<number>(0);
  // Debounce timer for real-time sync
  const syncDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isSyncingRef = useRef(false);
  const lastMarkdownRef = useRef<string>('');
  // Track when we're updating content internally to ignore file watcher events
  const isInternalUpdateRef = useRef(false);

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

  // Setup file watcher listeners
  useEffect(() => {
    async function setupFileWatchers() {
      try {
        // Listen for file changes
        const unlistenChanged = await onFileChanged(async (filePath) => {
          // Only handle if this is the current file
          if (fileStateRef.current.path === filePath) {
            // Ignore changes that happen during internal updates (source/preview sync)
            if (isInternalUpdateRef.current || isSyncingRef.current) {
              return;
            }
            
            // Ignore changes that happen within 500ms of our last save (to avoid reload loops)
            const timeSinceLastSave = Date.now() - lastSaveTimeRef.current;
            if (timeSinceLastSave < 500) {
              return;
            }

            // If no unsaved changes, auto-reload immediately
            if (!fileStateRef.current.hasUnsavedChanges) {
              try {
                isInternalUpdateRef.current = true;
                const result = await loadFileFromPath(filePath);
                if (result) {
                  setFileState({
                    path: result.path,
                    content: result.content,
                    hasUnsavedChanges: false,
                  });
                  // Update editor content
                  if (editorRef.current) {
                    editorRef.current.commands.setContent(result.content);
                  }
                }
                // Clear the flag after a short delay
                setTimeout(() => {
                  isInternalUpdateRef.current = false;
                }, 500);
              } catch (error) {
                console.error('Failed to auto-reload file:', error);
                isInternalUpdateRef.current = false;
              }
            } else {
              // Show dialog if there are unsaved changes
              setExternalChangeFilePath(filePath);
              setShowExternalChangeDialog(true);
            }
          }
        });
        fileChangeUnlistenRef.current = unlistenChanged;

        // Listen for file deletions
        const unlistenDeleted = await onFileDeleted(async (filePath) => {
          // Only handle if this is the current file
          if (fileStateRef.current.path === filePath) {
            // Stop watching
            await stopWatching(filePath);
            // Show notification (could be enhanced with a toast)
            alert(`The file "${filePath}" has been deleted.`);
            // Clear the file state
            setFileState({
              path: null,
              content: '',
              hasUnsavedChanges: false,
            });
          }
        });
        fileDeleteUnlistenRef.current = unlistenDeleted;
      } catch (error) {
        console.error('Failed to setup file watchers:', error);
      }
    }

    setupFileWatchers();

    return () => {
      // Cleanup listeners
      if (fileChangeUnlistenRef.current) {
        fileChangeUnlistenRef.current();
        fileChangeUnlistenRef.current = null;
      }
      if (fileDeleteUnlistenRef.current) {
        fileDeleteUnlistenRef.current();
        fileDeleteUnlistenRef.current = null;
      }
    };
  }, []);

  // Watch/unwatch file when fileState.path changes
  useEffect(() => {
    async function updateFileWatcher() {
      const currentPath = fileState.path;
      
      // Stop watching previous file if any
      if (fileStateRef.current.path && fileStateRef.current.path !== currentPath) {
        try {
          await stopWatching(fileStateRef.current.path);
        } catch (error) {
          console.error('Failed to stop watching file:', error);
        }
      }

      // Start watching new file if any
      if (currentPath) {
        try {
          await startWatching(currentPath);
        } catch (error) {
          console.error('Failed to start watching file:', error);
        }
      }
    }

    updateFileWatcher();
  }, [fileState.path]);

  // Initialize window and load file from URL params
  useEffect(() => {
    async function initWindow() {
      try {
        const label = await getCurrentWindowLabel();
        setWindowLabel(label);

        // Register this window
        const currentWindow = getCurrentWebviewWindow();
        await windowManager.updateWindowTitle(label, null);

        // Check if file path is passed via initialization script (from file associations)
        // @ts-ignore - window.openedFile is set by initialization script
        const openedFile = (window as any).openedFile;
        
        // Also check URL params (for backward compatibility)
        const params = new URLSearchParams(window.location.search);
        const filePathFromUrl = params.get('file');
        
        // Prefer initialization script file path, fallback to URL param
        const filePath = openedFile || filePathFromUrl;
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
            // File watcher will be started by the useEffect above
          }
        } else if (!isRestore && label === 'main') {
          // Only restore session on the main window and if not already restoring
          await windowManager.restoreWindowSession();
        }

        // Setup close request handler
        await currentWindow.onCloseRequested(async (event) => {
          // Stop watching before closing
          if (fileStateRef.current.path) {
            try {
              await stopWatching(fileStateRef.current.path);
            } catch (error) {
              console.error('Failed to stop watching on close:', error);
            }
          }

          if (hasUnsavedChangesRef.current) {
            event.preventDefault();
            setPendingAction('close');
            setShowUnsavedDialog(true);
          } else {
            // Check if this is the last window - if so, hide it instead of closing
            // to keep the app running (macOS behavior)
            const allWindows = windowManager.getAllWindows();
            if (allWindows.length <= 1) {
              // Hide the window instead of closing to keep app running
              event.preventDefault();
              await currentWindow.hide();
              await windowManager.saveWindowSession();
            } else {
              await windowManager.closeWindow(label);
              await windowManager.saveWindowSession();
            }
          }
        });

        // Update windows menu periodically
        updateWindowsMenu();
        const interval = setInterval(updateWindowsMenu, 2000);
        return () => {
          clearInterval(interval);
          // Cleanup: stop watching on unmount
          if (fileStateRef.current.path) {
            stopWatching(fileStateRef.current.path).catch(console.error);
          }
        };
      } catch (error) {
        console.error('Failed to initialize window:', error);
      }
    }

    initWindow();
     
  }, []);

  // Listen for open-file event (when file is opened in main window)
  useEffect(() => {
    const unlistenPromise = listen<string>('open-file', async (event) => {
      const filePath = event.payload;
      if (filePath) {
        const result = await loadFileFromPath(filePath);
        if (result) {
          setFileState({
            path: result.path,
            content: result.content,
            hasUnsavedChanges: false,
          });
          if (windowLabel) {
            windowManager.updateWindowTitle(windowLabel, result.path);
          }
        }
      }
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [windowLabel]);

  // Listen for menu events from native menu
  useEffect(() => {
    const unlistenOpenPromise = listen('menu-open-file', async () => {
      await handleOpen();
    });

    const unlistenSavePromise = listen('menu-save-file', async () => {
      await handleSave();
    });

    const unlistenSaveAsPromise = listen('menu-save-file-as', async () => {
      await handleSaveAs();
    });

    const unlistenHelpPromise = listen('menu-show-help', () => {
      setShowHelpDialog(true);
    });

    const unlistenAboutPromise = listen('menu-show-about', () => {
      setShowAboutDialog(true);
    });

    const unlistenQuitPromise = listen('menu-quit', async () => {
      await handleQuitApp();
    });

    return () => {
      unlistenOpenPromise.then((unlisten) => unlisten());
      unlistenSavePromise.then((unlisten) => unlisten());
      unlistenSaveAsPromise.then((unlisten) => unlisten());
      unlistenHelpPromise.then((unlisten) => unlisten());
      unlistenAboutPromise.then((unlisten) => unlisten());
      unlistenQuitPromise.then((unlisten) => unlisten());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileState.hasUnsavedChanges, fileState.path, showSource, markdownContent, editor, windowLabel]);

  // Listen for deep link URLs (e.g., marky://open?file=/path/to/file.md)
  useEffect(() => {
    const unlisten = onOpenUrl((urls) => {
      for (const url of urls) {
        try {
          const urlObj = new URL(url);
          // Handle marky://open?file=/path/to/file.md
          if (urlObj.protocol === 'marky:') {
            const filePath = urlObj.searchParams.get('file');
            if (filePath) {
              // Decode the file path
              const decodedPath = decodeURIComponent(filePath);
              // Load and open the file
              loadFileFromPath(decodedPath).then((result) => {
                if (result) {
                  setFileState({
                    path: result.path,
                    content: result.content,
                    hasUnsavedChanges: false,
                  });
                  if (windowLabel) {
                    windowManager.updateWindowTitle(windowLabel, result.path);
                  }
                }
              }).catch((error) => {
                console.error('Failed to open file from deep link:', error);
              });
            }
          }
        } catch (error) {
          console.error('Failed to parse deep link URL:', error);
        }
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [windowLabel]);

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
    // Stop watching current file before opening new one
    if (fileState.path) {
      try {
        await stopWatching(fileState.path);
      } catch (error) {
        console.error('Failed to stop watching file:', error);
      }
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
      // File watcher will be started by the useEffect above
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
    // Stop watching before closing
    if (fileState.path) {
      try {
        await stopWatching(fileState.path);
      } catch (error) {
        console.error('Failed to stop watching on close:', error);
      }
    }

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
      // Get current content - if in source mode, convert markdown to HTML first
      let currentContent: string;
      if (showSource && markdownContent) {
        // In source mode, use the current markdown and convert to HTML
        currentContent = await markdownToHTML(markdownContent, fileState.path);
      } else {
        // In preview mode, get HTML from editor
        currentContent = editor?.getHTML() || fileState.content;
      }
      
      const savedPath = await saveFile(currentContent, fileState.path);
      if (savedPath) {
        // Update last save time to ignore immediate file change events
        lastSaveTimeRef.current = Date.now();
        
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
      // Get current content - if in source mode, convert markdown to HTML first
      let currentContent: string;
      if (showSource && markdownContent) {
        // In source mode, use the current markdown and convert to HTML
        currentContent = await markdownToHTML(markdownContent, fileState.path);
      } else {
        // In preview mode, get HTML from editor
        currentContent = editor?.getHTML() || fileState.content;
      }
      
      const savedPath = await saveFileAs(currentContent);
      if (savedPath) {
        // Update last save time to ignore immediate file change events
        lastSaveTimeRef.current = Date.now();
        
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
    // Skip if this is an internal update (from source mode sync)
    if (isInternalUpdateRef.current) {
      return;
    }
    
    setFileState(prev => ({
      ...prev,
      content: newContent,
      hasUnsavedChanges: prev.content !== newContent && (prev.path !== null || newContent !== ''),
    }));

    // Real-time sync: when HTML changes in preview mode, update markdown
    if (!showSource && !isSyncingRef.current) {
      if (syncDebounceTimerRef.current) {
        clearTimeout(syncDebounceTimerRef.current);
      }
      syncDebounceTimerRef.current = setTimeout(async () => {
        try {
          isSyncingRef.current = true;
          const markdown = await htmlToMarkdown(newContent, fileState.path);
          setMarkdownContent(markdown);
        } catch (error) {
          console.error('Failed to sync HTML to markdown:', error);
        } finally {
          isSyncingRef.current = false;
        }
      }, 300);
    }
  }, [showSource, fileState.path]);

  const handleMarkdownChange = useCallback(async (newMarkdown: string) => {
    lastMarkdownRef.current = newMarkdown;
    setMarkdownContent(newMarkdown);

    // Real-time sync: when markdown changes in source mode, convert to HTML and update editor
    if (showSource && !isSyncingRef.current) {
      if (syncDebounceTimerRef.current) {
        clearTimeout(syncDebounceTimerRef.current);
      }
      syncDebounceTimerRef.current = setTimeout(async () => {
        try {
          isSyncingRef.current = true;
          isInternalUpdateRef.current = true;
          const html = await markdownToHTML(newMarkdown, fileState.path);
          
          // Update editor content
          if (editor) {
            editor.commands.setContent(html);
          }
          
          // Update file state
          setFileState(prev => ({
            ...prev,
            content: html,
            hasUnsavedChanges: prev.content !== html && (prev.path !== null || html !== ''),
          }));
          
          // Clear the internal update flag after a short delay to allow file watcher to settle
          setTimeout(() => {
            isInternalUpdateRef.current = false;
          }, 1000);
        } catch (error) {
          console.error('Failed to sync markdown to HTML:', error);
          isInternalUpdateRef.current = false;
        } finally {
          isSyncingRef.current = false;
        }
      }, 300);
    }
  }, [showSource, fileState.path, editor]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (syncDebounceTimerRef.current) {
        clearTimeout(syncDebounceTimerRef.current);
      }
    };
  }, []);

  // Initialize markdown content when file is loaded or content changes externally
  useEffect(() => {
    if (fileState.content) {
      // Always sync markdown when content changes externally (file load, etc.)
      // Only if we're not currently syncing to avoid loops
      if (!isSyncingRef.current) {
        htmlToMarkdown(fileState.content, fileState.path)
          .then((markdown) => {
            // Only update if different to avoid unnecessary re-renders
            if (markdown !== lastMarkdownRef.current) {
              lastMarkdownRef.current = markdown;
              setMarkdownContent(markdown);
            }
          })
          .catch((error) => {
            console.error('Failed to initialize markdown content:', error);
          });
      }
    }
  }, [fileState.content, fileState.path]);

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
            <Button
              variant={showSource ? 'default' : 'ghost'}
              size="sm"
              onClick={async () => {
                if (!showSource) {
                  // Switching to source mode: convert HTML to markdown
                  if (editor) {
                    const html = editor.getHTML();
                    try {
                      const markdown = await htmlToMarkdown(html, fileState.path);
                      setMarkdownContent(markdown);
                      setShowSource(true);
                    } catch (error) {
                      console.error('Failed to convert HTML to markdown:', error);
                    }
                  } else if (fileState.content) {
                    // Editor not ready yet, use fileState.content
                    try {
                      const markdown = await htmlToMarkdown(fileState.content, fileState.path);
                      setMarkdownContent(markdown);
                      setShowSource(true);
                    } catch (error) {
                      console.error('Failed to convert HTML to markdown:', error);
                    }
                  }
                } else {
                  // Switching to preview mode: markdown is already synced
                  setShowSource(false);
                }
              }}
              title="Toggle Source View"
              className="h-8 w-8 p-0"
            >
              <Code className="h-4 w-4" />
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
            showSource={showSource}
            markdownContent={markdownContent}
            onMarkdownChange={handleMarkdownChange}
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

      {/* External File Change Dialog */}
      <ExternalFileChangeDialog
        open={showExternalChangeDialog}
        onOpenChange={setShowExternalChangeDialog}
        onReload={async () => {
          setShowExternalChangeDialog(false);
          if (externalChangeFilePath) {
            try {
              const result = await loadFileFromPath(externalChangeFilePath);
              if (result) {
                setFileState({
                  path: result.path,
                  content: result.content,
                  hasUnsavedChanges: false,
                });
                // Update editor content
                if (editor) {
                  editor.commands.setContent(result.content);
                }
              }
            } catch (error) {
              console.error('Failed to reload file:', error);
            }
          }
          setExternalChangeFilePath(null);
        }}
        onKeepCurrent={() => {
          setShowExternalChangeDialog(false);
          setExternalChangeFilePath(null);
          // Keep watching for future changes
        }}
        onCancel={() => {
          setShowExternalChangeDialog(false);
          setExternalChangeFilePath(null);
          // Keep watching for future changes
        }}
        filePath={externalChangeFilePath || ''}
        hasUnsavedChanges={fileState.hasUnsavedChanges}
      />
      <HelpDialog
        open={showHelpDialog}
        onOpenChange={setShowHelpDialog}
      />
      <AboutDialog
        open={showAboutDialog}
        onOpenChange={setShowAboutDialog}
      />
    </div>
  );
}

export default App;
