import { type Editor } from '@tiptap/react';
import { Button } from './ui/button';
import {
  Bold,
  Italic,
  Underline,
  Heading1,
  Heading2,
  Heading3,
  Image,
  Table,
  Link,
  Code,
  FileCode,
  List,
  ListOrdered,
  Undo,
  Redo,
} from 'lucide-react';
import { InputDialog } from './InputDialog';
import { useState, useEffect } from 'react';
import { open, message } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';

interface ToolbarProps {
  editor: Editor | null;
}

export function Toolbar({ editor }: ToolbarProps) {
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [tableRowsDialogOpen, setTableRowsDialogOpen] = useState(false);
  const [tableColsDialogOpen, setTableColsDialogOpen] = useState(false);
  const [pendingTableRows, setPendingTableRows] = useState<number>(3);
  const [, setUpdateTrigger] = useState(0);

  // Force toolbar to re-render when editor selection changes
  useEffect(() => {
    if (!editor) return;

    const updateToolbar = () => {
      setUpdateTrigger(prev => prev + 1);
    };

    editor.on('selectionUpdate', updateToolbar);
    editor.on('transaction', updateToolbar);

    return () => {
      editor.off('selectionUpdate', updateToolbar);
      editor.off('transaction', updateToolbar);
    };
  }, [editor]);

  if (!editor) {
    return null;
  }

  const isActive = (name: string, attrs?: Record<string, unknown>) => {
    return editor.isActive(name, attrs);
  };

  const toggleBold = () => editor.chain().focus().toggleBold().run();
  const toggleItalic = () => editor.chain().focus().toggleItalic().run();
  const toggleUnderline = () => editor.chain().focus().toggleUnderline().run();
  const toggleCode = () => editor.chain().focus().toggleCode().run();
  const toggleCodeBlock = () => editor.chain().focus().toggleCodeBlock().run();
  const toggleHeading = (level: 1 | 2 | 3) => 
    editor.chain().focus().toggleHeading({ level }).run();
  const toggleBulletList = () => editor.chain().focus().toggleBulletList().run();
  const toggleOrderedList = () => editor.chain().focus().toggleOrderedList().run();
  
  const handleUndo = () => editor.chain().focus().undo().run();
  const handleRedo = () => editor.chain().focus().redo().run();
  
  const canUndo = editor.can().undo();
  const canRedo = editor.can().redo();

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
        // Read the file as bytes and convert to base64
        const fileData = await readFile(filePath);
        const base64 = btoa(String.fromCharCode(...fileData));
        
        // Determine the file extension for the MIME type
        const ext = filePath.split('.').pop()?.toLowerCase() || 'png';
        const mimeType = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
        
        // Create data URL
        const dataUrl = `data:${mimeType};base64,${base64}`;
        
        editor.chain().focus().setImage({ src: dataUrl }).run();
      }
    } catch (error) {
      console.error('Failed to insert image:', error);
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

  return (
    <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-background/50 backdrop-blur-sm">
      {/* Undo/Redo */}
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleUndo}
          disabled={!canUndo}
          className="h-8 w-8 p-0"
          title="Undo (Cmd+Z)"
        >
          <Undo className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRedo}
          disabled={!canRedo}
          className="h-8 w-8 p-0"
          title="Redo (Cmd+Shift+Z)"
        >
          <Redo className="h-4 w-4" />
        </Button>
      </div>

      <div className="w-px h-6 bg-border mx-1" />

      {/* Text Formatting */}
      <div className="flex items-center gap-0.5">
        <Button
          variant={isActive('bold') ? 'default' : 'ghost'}
          size="sm"
          onClick={toggleBold}
          className="h-8 w-8 p-0"
          title="Bold (Cmd+B)"
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          variant={isActive('italic') ? 'default' : 'ghost'}
          size="sm"
          onClick={toggleItalic}
          className="h-8 w-8 p-0"
          title="Italic (Cmd+I)"
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          variant={isActive('underline') ? 'default' : 'ghost'}
          size="sm"
          onClick={toggleUnderline}
          className="h-8 w-8 p-0"
          title="Underline"
        >
          <Underline className="h-4 w-4" />
        </Button>
        <Button
          variant={isActive('code') ? 'default' : 'ghost'}
          size="sm"
          onClick={toggleCode}
          className="h-8 w-8 p-0"
          title="Inline Code"
        >
          <Code className="h-4 w-4" />
        </Button>
        <Button
          variant={isActive('codeBlock') ? 'default' : 'ghost'}
          size="sm"
          onClick={toggleCodeBlock}
          className="h-8 w-8 p-0"
          title="Code Block"
        >
          <FileCode className="h-4 w-4" />
        </Button>
      </div>

      <div className="w-px h-6 bg-border mx-1" />

      {/* Headings */}
      <div className="flex items-center gap-0.5">
        <Button
          variant={isActive('heading', { level: 1 }) ? 'default' : 'ghost'}
          size="sm"
          onClick={() => toggleHeading(1)}
          className="h-8 w-8 p-0"
          title="Heading 1"
        >
          <Heading1 className="h-4 w-4" />
        </Button>
        <Button
          variant={isActive('heading', { level: 2 }) ? 'default' : 'ghost'}
          size="sm"
          onClick={() => toggleHeading(2)}
          className="h-8 w-8 p-0"
          title="Heading 2"
        >
          <Heading2 className="h-4 w-4" />
        </Button>
        <Button
          variant={isActive('heading', { level: 3 }) ? 'default' : 'ghost'}
          size="sm"
          onClick={() => toggleHeading(3)}
          className="h-8 w-8 p-0"
          title="Heading 3"
        >
          <Heading3 className="h-4 w-4" />
        </Button>
      </div>

      <div className="w-px h-6 bg-border mx-1" />

      {/* Lists */}
      <div className="flex items-center gap-0.5">
        <Button
          variant={isActive('bulletList') ? 'default' : 'ghost'}
          size="sm"
          onClick={toggleBulletList}
          className="h-8 w-8 p-0"
          title="Bullet List"
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          variant={isActive('orderedList') ? 'default' : 'ghost'}
          size="sm"
          onClick={toggleOrderedList}
          className="h-8 w-8 p-0"
          title="Numbered List"
        >
          <ListOrdered className="h-4 w-4" />
        </Button>
      </div>

      <div className="w-px h-6 bg-border mx-1" />

      {/* Insert Options */}
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={insertImage}
          className="h-8 w-8 p-0"
          title="Insert Image"
        >
          <Image className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={insertLink}
          className="h-8 w-8 p-0"
          title="Insert Link"
        >
          <Link className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={insertTable}
          className="h-8 w-8 p-0"
          title="Insert Table"
        >
          <Table className="h-4 w-4" />
        </Button>
      </div>

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
    </div>
  );
}
