import { useState, useEffect, useRef } from 'react';
import { Editor } from './components/Editor';
import { WindowControls } from './components/WindowControls';
import { openFile, saveFile, saveFileAs, exportToHTMLFile, type FileState } from './lib/fileOperations';
import { Button } from './components/ui/button';

function App() {
  const [fileState, setFileState] = useState<FileState>({
    path: null,
    content: '',
    hasUnsavedChanges: false,
  });

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

  const handleContentChange = (newContent: string) => {
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
  };

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
    <div className="flex flex-col h-screen w-screen bg-background text-foreground">
      {/* Header with window controls */}
      <header className="flex items-center justify-between border-b border-border" data-tauri-drag-region>
        <WindowControls />
        <div className="flex items-center gap-2 px-4" data-tauri-drag-region>
          <Button variant="ghost" size="sm" onClick={handleOpen}>
            Open
          </Button>
          <Button variant="ghost" size="sm" onClick={handleSave} disabled={!fileState.path && !fileState.hasUnsavedChanges}>
            Save
          </Button>
          <Button variant="ghost" size="sm" onClick={handleSaveAs}>
            Save As
          </Button>
          <Button variant="ghost" size="sm" onClick={handleExport}>
            Export HTML
          </Button>
          {fileState.hasUnsavedChanges && (
            <span className="text-xs text-muted-foreground">Unsaved changes</span>
          )}
        </div>
      </header>

      {/* Editor area */}
      <main className="flex-1 overflow-hidden">
        <Editor content={fileState.content} onChange={handleContentChange} />
      </main>
    </div>
  );
}

export default App;
