import { type Editor } from '@tiptap/react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  ContextMenuShortcut,
} from '../ui/context-menu';
import { 
  Image, 
  Table, 
  Link, 
  Wand2, 
  Palette,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Code as CodeIcon,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  List,
  ListOrdered,
  Undo,
  Redo,
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { InputDialog } from '../dialogs/InputDialog';
import { createFormattingCommands, createInsertionCommands } from './utils/commands';

interface EditorContextMenuProps {
  editor: Editor | null;
  children: ReactNode;
  currentFilePath?: string | null;
  onGrammarCorrect?: () => void;
  onStyleChange?: () => void;
}

export function EditorContextMenu({ 
  editor, 
  children,
  onGrammarCorrect, 
  onStyleChange 
}: EditorContextMenuProps) {
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [tableRowsDialogOpen, setTableRowsDialogOpen] = useState(false);
  const [tableColsDialogOpen, setTableColsDialogOpen] = useState(false);
  const [pendingTableRows, setPendingTableRows] = useState<number>(3);
  const [, setUpdateTrigger] = useState(0);

  const insertImage = useCallback(async () => {
    if (!editor) return;
    const insertion = createInsertionCommands(editor);
    await insertion.insertImage();
  }, [editor]);

  const insertTable = useCallback(() => {
    setTableRowsDialogOpen(true);
  }, []);

  // Force context menu to re-render when editor selection changes
  useEffect(() => {
    if (!editor) return;

    const updateMenu = () => {
      setUpdateTrigger(prev => prev + 1);
    };

    editor.on('selectionUpdate', updateMenu);
    editor.on('transaction', updateMenu);

    return () => {
      editor.off('selectionUpdate', updateMenu);
      editor.off('transaction', updateMenu);
    };
  }, [editor]);

  // Add keyboard shortcuts
  useEffect(() => {
    if (!editor) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'i') {
        e.preventDefault();
        insertImage();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 't') {
        e.preventDefault();
        insertTable();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editor, insertImage, insertTable]);

  if (!editor) {
    return <>{children}</>;
  }

  const formatting = createFormattingCommands(editor);
  const insertion = createInsertionCommands(editor);

  const insertLink = async () => {
    const shouldOpen = await insertion.insertLink();
    if (shouldOpen) {
      setLinkDialogOpen(true);
    }
  };

  const handleLinkSubmit = (url: string) => {
    insertion.setLink(url);
  };

  const handleTableRowsSubmit = (rows: string) => {
    const numRows = parseInt(rows, 10);
    if (!isNaN(numRows) && numRows > 0 && numRows <= 20) {
      setPendingTableRows(numRows);
      setTableColsDialogOpen(true);
    }
  };

  const handleTableColsSubmit = (cols: string) => {
    const numCols = parseInt(cols, 10);
    if (!isNaN(numCols) && numCols > 0 && numCols <= 20) {
      insertion.insertTable(pendingTableRows, numCols);
    }
  };

  const handleGrammarCorrect = () => {
    // Placeholder for grammar correction
    if (onGrammarCorrect) {
      onGrammarCorrect();
    } else {
      console.log('Grammar correction feature coming soon!');
    }
  };

  const handleStyleChange = () => {
    // Placeholder for style change
    if (onStyleChange) {
      onStyleChange();
    } else {
      console.log('Style change feature coming soon!');
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        {/* Undo/Redo */}
        <ContextMenuItem onSelect={formatting.handleUndo} disabled={!formatting.canUndo()}>
          <Undo className="mr-2 h-4 w-4" />
          Undo
          <ContextMenuShortcut>⌘Z</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={formatting.handleRedo} disabled={!formatting.canRedo()}>
          <Redo className="mr-2 h-4 w-4" />
          Redo
          <ContextMenuShortcut>⇧⌘Z</ContextMenuShortcut>
        </ContextMenuItem>
        
        <ContextMenuSeparator />
        
        {/* Text Formatting */}
        <ContextMenuItem onSelect={formatting.toggleBold}>
          <Bold className="mr-2 h-4 w-4" />
          <span className={formatting.isActive('bold') ? 'font-bold' : ''}>Bold</span>
          <ContextMenuShortcut>⌘B</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={formatting.toggleItalic}>
          <Italic className="mr-2 h-4 w-4" />
          <span className={formatting.isActive('italic') ? 'font-bold' : ''}>Italic</span>
          <ContextMenuShortcut>⌘I</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={formatting.toggleUnderline}>
          <UnderlineIcon className="mr-2 h-4 w-4" />
          <span className={formatting.isActive('underline') ? 'font-bold' : ''}>Underline</span>
          <ContextMenuShortcut>⌘U</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={formatting.toggleCode}>
          <CodeIcon className="mr-2 h-4 w-4" />
          <span className={formatting.isActive('code') ? 'font-bold' : ''}>Code</span>
          <ContextMenuShortcut>⌘E</ContextMenuShortcut>
        </ContextMenuItem>
        
        <ContextMenuSeparator />
        
        {/* Headings */}
        <ContextMenuItem onSelect={() => formatting.toggleHeading(1)}>
          <Heading1 className="mr-2 h-4 w-4" />
          <span className={formatting.isActive('heading', { level: 1 }) ? 'font-bold' : ''}>Heading 1</span>
          <ContextMenuShortcut>⌥⌘1</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => formatting.toggleHeading(2)}>
          <Heading2 className="mr-2 h-4 w-4" />
          <span className={formatting.isActive('heading', { level: 2 }) ? 'font-bold' : ''}>Heading 2</span>
          <ContextMenuShortcut>⌥⌘2</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => formatting.toggleHeading(3)}>
          <Heading3 className="mr-2 h-4 w-4" />
          <span className={formatting.isActive('heading', { level: 3 }) ? 'font-bold' : ''}>Heading 3</span>
          <ContextMenuShortcut>⌥⌘3</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => formatting.toggleHeading(4)}>
          <Heading4 className="mr-2 h-4 w-4" />
          <span className={formatting.isActive('heading', { level: 4 }) ? 'font-bold' : ''}>Heading 4</span>
          <ContextMenuShortcut>⌥⌘4</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => formatting.toggleHeading(5)}>
          <Heading5 className="mr-2 h-4 w-4" />
          <span className={formatting.isActive('heading', { level: 5 }) ? 'font-bold' : ''}>Heading 5</span>
          <ContextMenuShortcut>⌥⌘5</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => formatting.toggleHeading(6)}>
          <Heading6 className="mr-2 h-4 w-4" />
          <span className={formatting.isActive('heading', { level: 6 }) ? 'font-bold' : ''}>Heading 6</span>
          <ContextMenuShortcut>⌥⌘6</ContextMenuShortcut>
        </ContextMenuItem>
        
        <ContextMenuSeparator />
        
        {/* Lists */}
        <ContextMenuItem onSelect={formatting.toggleBulletList}>
          <List className="mr-2 h-4 w-4" />
          <span className={formatting.isActive('bulletList') ? 'font-bold' : ''}>Bullet List</span>
          <ContextMenuShortcut>⇧⌘8</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={formatting.toggleOrderedList}>
          <ListOrdered className="mr-2 h-4 w-4" />
          <span className={formatting.isActive('orderedList') ? 'font-bold' : ''}>Numbered List</span>
          <ContextMenuShortcut>⇧⌘7</ContextMenuShortcut>
        </ContextMenuItem>
        
        <ContextMenuSeparator />
        
        {/* Insert Options */}
        <ContextMenuItem onSelect={insertImage}>
          <Image className="mr-2 h-4 w-4" />
          Insert Image
          <ContextMenuShortcut>⇧⌘I</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={insertTable}>
          <Table className="mr-2 h-4 w-4" />
          Insert Table
          <ContextMenuShortcut>⌘T</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={insertLink}>
          <Link className="mr-2 h-4 w-4" />
          Insert Link
          <ContextMenuShortcut>⌘K</ContextMenuShortcut>
        </ContextMenuItem>
        
        <ContextMenuSeparator />
        
        {/* AI Features */}
        <ContextMenuItem onSelect={handleGrammarCorrect}>
          <Wand2 className="mr-2 h-4 w-4" />
          Correct Grammar
        </ContextMenuItem>
        <ContextMenuItem onSelect={handleStyleChange}>
          <Palette className="mr-2 h-4 w-4" />
          Change Style
        </ContextMenuItem>
      </ContextMenuContent>

      {/* Dialogs */}
      <InputDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        title="Insert Link"
        description="Enter the URL for the link"
        placeholder="https://example.com"
        defaultValue="https://"
        onSubmit={handleLinkSubmit}
      />
      <InputDialog
        open={tableRowsDialogOpen}
        onOpenChange={setTableRowsDialogOpen}
        title="Table Rows"
        description="How many rows?"
        placeholder="3"
        defaultValue="3"
        onSubmit={handleTableRowsSubmit}
      />
      <InputDialog
        open={tableColsDialogOpen}
        onOpenChange={setTableColsDialogOpen}
        title="Table Columns"
        description="How many columns?"
        placeholder="3"
        defaultValue="3"
        onSubmit={handleTableColsSubmit}
      />
    </ContextMenu>
  );
}
