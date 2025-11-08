import { useState, useEffect, useRef, useCallback } from 'react';
import { Editor } from './components/Editor';
import { Toolbar } from './components/Toolbar';
import { WindowControls } from './components/WindowControls';
import { openFile, saveFile, saveFileAs, exportToHTMLFile, type FileState } from './lib/fileOperations';
import { Button } from './components/ui/button';
import { Pencil, FolderOpen, Save, SaveAll, FileCode } from 'lucide-react';
import { type Editor as TipTapEditor } from '@tiptap/react';

function App() {
  const [fileState, setFileState] = useState<FileState>({
    path: null,
    content: '',
    hasUnsavedChanges: false,
  });

  const [showToolbar, setShowToolbar] = useState(false);
  const [editor, setEditor] = useState<TipTapEditor | null>(null);

  // Undo/Redo history
  const historyRef = useRef<string[]>(['']);
  const historyIndexRef = useRef<number>(0);
  const isUndoRedoRef = useRef<boolean>(false);

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
      const savedPath = await saveFile(fileState.content, fileState.path);
      if (savedPath) {
        setFileState((prev) => ({
          ...prev,
          path: savedPath,
          hasUnsavedChanges: false,
        }));
      }
    } catch (error) {
      console.error('Failed to save file:', error);
    }
  };

  const handleSaveAs = async () => {
    try {
      const savedPath = await saveFileAs(fileState.content);
      if (savedPath) {
        setFileState((prev) => ({
          ...prev,
          path: savedPath,
          hasUnsavedChanges: false,
        }));
      }
    } catch (error) {
      console.error('Failed to save file as:', error);
    }
  };

  const handleExport = async () => {
    try {
      await exportToHTMLFile(fileState.content);
    } catch (error) {
      console.error('Failed to export to HTML:', error);
    }
  };

  const handleContentChange = useCallback((newContent: string) => {
    // Don't add to history if this is an undo/redo operation
    if (!isUndoRedoRef.current) {
      const currentContent = fileState.content;
      
      // Only add to history if content actually changed
      if (currentContent !== newContent) {
        // Remove any history after current index (when user types after undo)
        historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
        
        // Always save current state before the change (if it's different from last history entry)
        const lastHistoryEntry = historyRef.current[historyIndexRef.current];
        if (lastHistoryEntry !== currentContent) {
          historyRef.current.push(currentContent);
          historyIndexRef.current++;
        }
        
        // Add new content to history
        historyRef.current.push(newContent);
        historyIndexRef.current = historyRef.current.length - 1;
        
        // Limit history size to 100 entries
        if (historyRef.current.length > 100) {
          historyRef.current.shift();
          historyIndexRef.current--;
        }
      }
    }

    setFileState((prev) => ({
      ...prev,
      content: newContent,
      hasUnsavedChanges: prev.content !== newContent && (prev.path !== null || newContent !== ''),
    }));
  }, [fileState.content]); // Depend on fileState.content

  const handleUndo = () => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current--;
      isUndoRedoRef.current = true;
      const previousContent = historyRef.current[historyIndexRef.current];
      setFileState((prev) => ({
        ...prev,
        content: previousContent,
        hasUnsavedChanges: true,
      }));
      // Reset flag after state update
      setTimeout(() => {
        isUndoRedoRef.current = false;
      }, 0);
    }
  };

  const handleRedo = () => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current++;
      isUndoRedoRef.current = true;
      const nextContent = historyRef.current[historyIndexRef.current];
      setFileState((prev) => ({
        ...prev,
        content: nextContent,
        hasUnsavedChanges: true,
      }));
      // Reset flag after state update
      setTimeout(() => {
        isUndoRedoRef.current = false;
      }, 0);
    }
  };

  // Initialize history when file is opened
  useEffect(() => {
    if (fileState.path !== null) {
      historyRef.current = [fileState.content];
      historyIndexRef.current = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileState.path]); // Reset history when file changes

  // Keyboard shortcuts
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
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="w-screen h-screen flex items-center justify-center bg-transparent">
      <div className="flex flex-col w-[calc(100%-8px)] h-[calc(100%-8px)] bg-stone-950/95 backdrop-blur-xl text-foreground rounded-2xl overflow-hidden shadow-2xl border border-stone-800">
        {/* Header with window controls */}
        <header className="flex items-center justify-between border-b border-border py-2" data-tauri-drag-region>
          <WindowControls />
          <div className="flex items-center gap-2 px-4" data-tauri-drag-region>
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
            title="Save (Cmd+S)"
            className="h-8 w-8 p-0"
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
          {fileState.hasUnsavedChanges && (
            <span className="text-xs text-muted-foreground">Unsaved changes</span>
          )}
        </div>
      </header>

      {/* Toolbar */}
      {showToolbar && <Toolbar editor={editor} />}

      {/* Editor area */}
      <main className="flex-1 overflow-hidden">
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
