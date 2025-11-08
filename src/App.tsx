import { useState, useEffect, useCallback } from 'react';
import { Editor } from './components/Editor';
import { Toolbar } from './components/Toolbar';
import { WindowControls } from './components/WindowControls';

import {
  openFile,
  saveFile,
  saveFileAs,
  exportToHTMLFile,
  type FileState,
} from './lib/fileOperations';
import { Button } from './components/ui/button';
import { Pencil, FolderOpen, Save, SaveAll, FileCode } from 'lucide-react';
import { type Editor as TipTapEditor } from '@tiptap/react';
import logo from '/logo.png';

function App() {
  const [fileState, setFileState] = useState<FileState>({
    path: null,
    content: '',
    hasUnsavedChanges: false,
  });

  const [showToolbar, setShowToolbar] = useState(false);
  const [editor, setEditor] = useState<TipTapEditor | null>(null);

  const handleOpen = async () => {
    try {
      const result = await openFile();
      if (result) {
        setFileState({
          path: result.path,
          content: result.content,
          hasUnsavedChanges: false,
        });
      }
    } catch (error) {
      console.error('Failed to open file:', error);
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
      if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
        e.preventDefault();
        handleOpen();
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
  }, []);

  return (
    <div className="w-screen h-screen bg-transparent text-foreground">
      <div className="flex flex-col w-full h-full bg-ui-window backdrop-blur-2xl rounded-2xl shadow-2xl border border-ui-window overflow-hidden">
        {/* Header with window controls */}
        <header
          className="flex items-center justify-between border-b border-ui-window bg-background py-2 px-4"
          data-tauri-drag-region
        >
          <div className="flex items-center gap-2" data-tauri-drag-region>
            <WindowControls />
            <img src={logo} alt="Marky" className="size-8" data-tauri-drag-region />
            <span
              className="text-sm font-semibold text-foreground select-none cursor-default"
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
              onClick={handleOpen}
              title="Open File (Cmd+O)"
              className="h-8 w-8 p-0"
            >
              <FolderOpen className="h-4 w-4" />
            </Button>
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
              onClick={handleExport}
              title="Export to HTML"
              className="h-8 w-8 p-0"
            >
              <FileCode className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* Toolbar */}
        {showToolbar && <Toolbar editor={editor} />}

        {/* Editor area */}
        <main className="flex-1 overflow-hidden bg-background/70">
          <Editor
            content={fileState.content}
            onChange={handleContentChange}
            onEditorReady={setEditor}
          />
        </main>
      </div>
    </div>
  );
}

export default App;
