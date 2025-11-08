import { type Editor } from '@tiptap/react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from './ui/context-menu';
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
  List,
  ListOrdered,
  Undo,
  Redo,
} from 'lucide-react';
import { open, message } from '@tauri-apps/plugin-dialog';
import { saveImageForMarkdown } from '../lib/imageHandler';
import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { InputDialog } from './InputDialog';

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
  currentFilePath,
  onGrammarCorrect, 
  onStyleChange 
}: EditorContextMenuProps) {
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [tableRowsDialogOpen, setTableRowsDialogOpen] = useState(false);
  const [tableColsDialogOpen, setTableColsDialogOpen] = useState(false);
  const [pendingTableRows, setPendingTableRows] = useState<number>(3);
  const [, setUpdateTrigger] = useState(0);

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

  if (!editor) {
    return <>{children}</>;
  }

  const insertImage = async () => {
    try {
      const filePath = await open({
        multiple: false,
        filters: [{
          name: 'Images',
          extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']
        }]
      });

      if (filePath && typeof filePath === 'string') {
        // Read the image and convert to base64 for display
        const { readFile } = await import('@tauri-apps/plugin-fs');
        const imageData = await readFile(filePath);
        
        // Detect image type from extension
        const ext = filePath.split('.').pop()?.toLowerCase() || 'png';
        const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
        
        // Convert to base64
        const base64 = btoa(String.fromCharCode(...imageData));
        const dataUrl = `data:${mimeType};base64,${base64}`;
        
        // Insert image with base64 src and original path in data-original-src
        editor.chain().focus().setImage({ 
          src: dataUrl,
          'data-original-src': filePath
        }).run();
      }
    } catch (error) {
      console.error('Failed to insert image:', error);
      await message('Failed to insert image. Please try again.', {
        title: 'Error',
        kind: 'error'
      });
    }
  };

  const insertLink = async () => {
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, ' ');
    
    if (!selectedText || selectedText.trim() === '') {
      await message('Please select some text first to add a link', { title: 'No Text Selected', kind: 'info' });
      return;
    }
    
    setLinkDialogOpen(true);
  };

  const handleLinkSubmit = (url: string) => {
    if (url && url.trim()) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
  };

  const insertTable = () => {
    setTableRowsDialogOpen(true);
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
      editor.chain().focus().insertTable({ 
        rows: pendingTableRows, 
        cols: numCols, 
        withHeaderRow: true 
      }).run();
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

  const toggleBold = () => editor.chain().focus().toggleBold().run();
  const toggleItalic = () => editor.chain().focus().toggleItalic().run();
  const toggleUnderline = () => editor.chain().focus().toggleUnderline().run();
  const toggleCode = () => editor.chain().focus().toggleCode().run();
  const toggleHeading = (level: 1 | 2 | 3) => editor.chain().focus().toggleHeading({ level }).run();
  const toggleBulletList = () => editor.chain().focus().toggleBulletList().run();
  const toggleOrderedList = () => editor.chain().focus().toggleOrderedList().run();

  const isActive = (name: string, attrs?: Record<string, unknown>) => {
    return editor.isActive(name, attrs);
  };

  const handleUndo = () => editor.chain().focus().undo().run();
  const handleRedo = () => editor.chain().focus().redo().run();
  
  const canUndo = editor.can().undo();
  const canRedo = editor.can().redo();

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        {/* Undo/Redo */}
        <ContextMenuItem onSelect={handleUndo} disabled={!canUndo}>
          <Undo className="mr-2 h-4 w-4" />
          Undo
        </ContextMenuItem>
        <ContextMenuItem onSelect={handleRedo} disabled={!canRedo}>
          <Redo className="mr-2 h-4 w-4" />
          Redo
        </ContextMenuItem>
        
        <ContextMenuSeparator />
        
        {/* Text Formatting */}
        <ContextMenuItem onSelect={toggleBold}>
          <Bold className="mr-2 h-4 w-4" />
          <span className={isActive('bold') ? 'font-bold' : ''}>Bold</span>
        </ContextMenuItem>
        <ContextMenuItem onSelect={toggleItalic}>
          <Italic className="mr-2 h-4 w-4" />
          <span className={isActive('italic') ? 'font-bold' : ''}>Italic</span>
        </ContextMenuItem>
        <ContextMenuItem onSelect={toggleUnderline}>
          <UnderlineIcon className="mr-2 h-4 w-4" />
          <span className={isActive('underline') ? 'font-bold' : ''}>Underline</span>
        </ContextMenuItem>
        <ContextMenuItem onSelect={toggleCode}>
          <CodeIcon className="mr-2 h-4 w-4" />
          <span className={isActive('code') ? 'font-bold' : ''}>Code</span>
        </ContextMenuItem>
        
        <ContextMenuSeparator />
        
        {/* Headings */}
        <ContextMenuItem onSelect={() => toggleHeading(1)}>
          <Heading1 className="mr-2 h-4 w-4" />
          <span className={isActive('heading', { level: 1 }) ? 'font-bold' : ''}>Heading 1</span>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => toggleHeading(2)}>
          <Heading2 className="mr-2 h-4 w-4" />
          <span className={isActive('heading', { level: 2 }) ? 'font-bold' : ''}>Heading 2</span>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => toggleHeading(3)}>
          <Heading3 className="mr-2 h-4 w-4" />
          <span className={isActive('heading', { level: 3 }) ? 'font-bold' : ''}>Heading 3</span>
        </ContextMenuItem>
        
        <ContextMenuSeparator />
        
        {/* Lists */}
        <ContextMenuItem onSelect={toggleBulletList}>
          <List className="mr-2 h-4 w-4" />
          <span className={isActive('bulletList') ? 'font-bold' : ''}>Bullet List</span>
        </ContextMenuItem>
        <ContextMenuItem onSelect={toggleOrderedList}>
          <ListOrdered className="mr-2 h-4 w-4" />
          <span className={isActive('orderedList') ? 'font-bold' : ''}>Numbered List</span>
        </ContextMenuItem>
        
        <ContextMenuSeparator />
        
        {/* Insert Options */}
        <ContextMenuItem onSelect={insertImage}>
          <Image className="mr-2 h-4 w-4" />
          Insert Image
        </ContextMenuItem>
        <ContextMenuItem onSelect={insertTable}>
          <Table className="mr-2 h-4 w-4" />
          Insert Table
        </ContextMenuItem>
        <ContextMenuItem onSelect={insertLink}>
          <Link className="mr-2 h-4 w-4" />
          Insert Link
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
