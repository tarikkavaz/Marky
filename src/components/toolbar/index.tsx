import { type Editor } from '@tiptap/react';
import { useState, useEffect, useRef } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
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
import { ToolbarButton } from './ToolbarButton';
import { ToolbarGroup } from './ToolbarGroup';
import { ToolbarInsert, type ToolbarInsertRef } from './ToolbarInsert';
import { createFormattingCommands, createInsertionCommands } from '../editor/utils/commands';

interface ToolbarProps {
  editor: Editor | null;
  currentFilePath: string | null;
}

export function Toolbar({ editor }: ToolbarProps) {
  const [, setUpdateTrigger] = useState(0);
  const insertRef = useRef<ToolbarInsertRef>(null);

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

  const formatting = createFormattingCommands(editor);
  const insertion = createInsertionCommands(editor);

  const handleInsertImage = async () => {
    await insertion.insertImage();
  };

  const handleInsertLink = async () => {
    const shouldOpen = await insertion.insertLink();
    if (shouldOpen) {
      insertRef.current?.openLinkDialog();
    }
  };

  const handleInsertTable = () => {
    insertRef.current?.openTableDialog();
  };

  return (
    <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-background/50 backdrop-blur-sm">
      {/* Undo/Redo */}
      <ToolbarGroup>
        <ToolbarButton
          icon={Undo}
          onClick={formatting.handleUndo}
          disabled={!formatting.canUndo()}
          title="Undo (Cmd+Z)"
        />
        <ToolbarButton
          icon={Redo}
          onClick={formatting.handleRedo}
          disabled={!formatting.canRedo()}
          title="Redo (Cmd+Shift+Z)"
        />
      </ToolbarGroup>

      {/* Text Formatting */}
      <ToolbarGroup>
        <ToolbarButton
          icon={Bold}
          onClick={formatting.toggleBold}
          isActive={formatting.isActive('bold')}
          title="Bold (Cmd+B)"
        />
        <ToolbarButton
          icon={Italic}
          onClick={formatting.toggleItalic}
          isActive={formatting.isActive('italic')}
          title="Italic (Cmd+I)"
        />
        <ToolbarButton
          icon={Underline}
          onClick={formatting.toggleUnderline}
          isActive={formatting.isActive('underline')}
          title="Underline"
        />
        <ToolbarButton
          icon={Code}
          onClick={formatting.toggleCode}
          isActive={formatting.isActive('code')}
          title="Inline Code"
        />
        <ToolbarButton
          icon={FileCode}
          onClick={formatting.toggleCodeBlock}
          isActive={formatting.isActive('codeBlock')}
          title="Code Block"
        />
      </ToolbarGroup>

      {/* Headings */}
      <ToolbarGroup>
        <ToolbarButton
          icon={Heading1}
          onClick={() => formatting.toggleHeading(1)}
          isActive={formatting.isActive('heading', { level: 1 })}
          title="Heading 1"
        />
        <ToolbarButton
          icon={Heading2}
          onClick={() => formatting.toggleHeading(2)}
          isActive={formatting.isActive('heading', { level: 2 })}
          title="Heading 2"
        />
        <ToolbarButton
          icon={Heading3}
          onClick={() => formatting.toggleHeading(3)}
          isActive={formatting.isActive('heading', { level: 3 })}
          title="Heading 3"
        />
        <ToolbarButton
          icon={Heading4}
          onClick={() => formatting.toggleHeading(4)}
          isActive={formatting.isActive('heading', { level: 4 })}
          title="Heading 4"
        />
        <ToolbarButton
          icon={Heading5}
          onClick={() => formatting.toggleHeading(5)}
          isActive={formatting.isActive('heading', { level: 5 })}
          title="Heading 5"
        />
        <ToolbarButton
          icon={Heading6}
          onClick={() => formatting.toggleHeading(6)}
          isActive={formatting.isActive('heading', { level: 6 })}
          title="Heading 6"
        />
      </ToolbarGroup>

      {/* Lists */}
      <ToolbarGroup>
        <ToolbarButton
          icon={List}
          onClick={formatting.toggleBulletList}
          isActive={formatting.isActive('bulletList')}
          title="Bullet List"
        />
        <ToolbarButton
          icon={ListOrdered}
          onClick={formatting.toggleOrderedList}
          isActive={formatting.isActive('orderedList')}
          title="Numbered List"
        />
      </ToolbarGroup>

      {/* Insert Options */}
      <ToolbarGroup>
        <ToolbarButton
          icon={Image}
          onClick={handleInsertImage}
          title="Insert Image"
        />
        <ToolbarButton
          icon={Link}
          onClick={handleInsertLink}
          title="Insert Link"
        />
        <ToolbarButton
          icon={Table}
          onClick={handleInsertTable}
          title="Insert Table"
        />
      </ToolbarGroup>

      {/* Dialogs */}
      <ToolbarInsert ref={insertRef} editor={editor} />
    </div>
  );
}
