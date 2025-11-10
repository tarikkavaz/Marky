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
  Braces,
  List,
  ListOrdered,
  Undo,
  Redo,
  Indent,
  Outdent,
  CheckSquare,
  Quote,
  Info,
  Lightbulb,
  MessageSquareWarning,
  AlertTriangle,
  AlertCircle,
  Footprints,
  Minus,
} from 'lucide-react';
import { ToolbarButton } from './ToolbarButton';
import { ToolbarGroup } from './ToolbarGroup';
import { ToolbarInsert, type ToolbarInsertRef } from './ToolbarInsert';
import { ToolbarDropdown } from './ToolbarDropdown';
import { createFormattingCommands, createInsertionCommands } from '../editor/utils/commands';
import { FootnoteDialog } from '../dialogs/FootnoteDialog';
import { InputDialog } from '../dialogs/InputDialog';

interface ToolbarProps {
  editor: Editor | null;
  currentFilePath: string | null;
}

export function Toolbar({ editor, currentFilePath }: ToolbarProps) {
  const [, setUpdateTrigger] = useState(0);
  const insertRef = useRef<ToolbarInsertRef>(null);
  const [footnoteDialogOpen, setFootnoteDialogOpen] = useState(false);
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [pendingImageData, setPendingImageData] = useState<{ dataUrl: string; path: string } | null>(null);

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
  const insertion = createInsertionCommands(editor, currentFilePath);

  const handleInsertImage = async () => {
    const imageData = await insertion.insertImage();
    if (imageData) {
      setPendingImageData(imageData);
      setImageDialogOpen(true);
    }
  };

  const handleImageAltSubmit = (alt: string) => {
    if (pendingImageData) {
      insertion.setImage(pendingImageData.dataUrl, pendingImageData.path, alt);
      setPendingImageData(null);
    }
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
          icon={Braces}
          onClick={formatting.toggleCodeBlock}
          isActive={formatting.isActive('codeBlock')}
          title="Code Block (Cmd+Shift+C)"
        />
      </ToolbarGroup>

      {/* Headings */}
      <ToolbarGroup>
        <ToolbarDropdown
          icon={Heading1}
          label="Headings"
          isActive={
            formatting.isActive('heading', { level: 1 }) ||
            formatting.isActive('heading', { level: 2 }) ||
            formatting.isActive('heading', { level: 3 }) ||
            formatting.isActive('heading', { level: 4 }) ||
            formatting.isActive('heading', { level: 5 }) ||
            formatting.isActive('heading', { level: 6 })
          }
          items={[
            {
              label: 'Heading 1',
              icon: Heading1,
              onClick: () => formatting.toggleHeading(1),
              isActive: formatting.isActive('heading', { level: 1 }),
            },
            {
              label: 'Heading 2',
              icon: Heading2,
              onClick: () => formatting.toggleHeading(2),
              isActive: formatting.isActive('heading', { level: 2 }),
            },
            {
              label: 'Heading 3',
              icon: Heading3,
              onClick: () => formatting.toggleHeading(3),
              isActive: formatting.isActive('heading', { level: 3 }),
            },
            {
              label: 'Heading 4',
              icon: Heading4,
              onClick: () => formatting.toggleHeading(4),
              isActive: formatting.isActive('heading', { level: 4 }),
            },
            {
              label: 'Heading 5',
              icon: Heading5,
              onClick: () => formatting.toggleHeading(5),
              isActive: formatting.isActive('heading', { level: 5 }),
            },
            {
              label: 'Heading 6',
              icon: Heading6,
              onClick: () => formatting.toggleHeading(6),
              isActive: formatting.isActive('heading', { level: 6 }),
            },
          ]}
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
        <ToolbarButton
          icon={CheckSquare}
          onClick={formatting.toggleTaskList}
          isActive={formatting.isActive('taskList')}
          title="Task List"
        />
      </ToolbarGroup>

      {/* List Indentation */}
      <ToolbarGroup>
        <ToolbarDropdown
          icon={Indent}
          label="List Indentation"
          items={[
            {
              label: 'Indent',
              icon: Indent,
              onClick: formatting.indentList,
              shortcut: 'Tab',
            },
            {
              label: 'Outdent',
              icon: Outdent,
              onClick: formatting.outdentList,
              shortcut: 'Shift+Tab',
            },
          ]}
        />
      </ToolbarGroup>

      {/* Quotes */}
      <ToolbarGroup>
        <ToolbarButton
          icon={Quote}
          onClick={formatting.toggleBlockquote}
          isActive={formatting.isActive('blockquote')}
          title="Quote"
        />
      </ToolbarGroup>

      {/* Alerts */}
      <ToolbarGroup>
        <ToolbarDropdown
          icon={Info}
          label="Alerts"
          items={[
            {
              label: 'Note Block',
              icon: Info,
              onClick: () => formatting.insertAlert('note'),
            },
            {
              label: 'Tip Block',
              icon: Lightbulb,
              onClick: () => formatting.insertAlert('tip'),
            },
            {
              label: 'Important Block',
              icon: MessageSquareWarning,
              onClick: () => formatting.insertAlert('important'),
            },
            {
              label: 'Warning Block',
              icon: AlertTriangle,
              onClick: () => formatting.insertAlert('warning'),
            },
            {
              label: 'Caution Block',
              icon: AlertCircle,
              onClick: () => formatting.insertAlert('caution'),
            },
          ]}
        />
      </ToolbarGroup>

      {/* Footnotes & Horizontal Line */}
      <ToolbarGroup>
        <ToolbarButton
          icon={Footprints}
          onClick={() => {
            setFootnoteDialogOpen(true);
          }}
          title="Insert Footnote"
        />
        <ToolbarButton
          icon={Minus}
          onClick={formatting.insertHorizontalRule}
          title="Insert Horizontal Line"
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
      <InputDialog
        open={imageDialogOpen}
        onOpenChange={(open) => {
          setImageDialogOpen(open);
          if (!open) {
            setPendingImageData(null);
          }
        }}
        title="Image Alt Text"
        description="Enter alt text for the image (optional)"
        placeholder="Image description"
        defaultValue=""
        allowEmpty={true}
        onSubmit={handleImageAltSubmit}
      />
      <FootnoteDialog
        open={footnoteDialogOpen}
        onOpenChange={setFootnoteDialogOpen}
        defaultId={(() => {
          if (!editor) return '1';
          const { state } = editor;
          let footnoteCount = 1;
          state.doc.descendants((node) => {
            if (node.type.name === 'footnoteReference') {
              const nodeId = parseInt(node.attrs.id) || 0;
              if (nodeId >= footnoteCount) {
                footnoteCount = nodeId + 1;
              }
            }
          });
          return footnoteCount.toString();
        })()}
        onSubmit={(id, content) => {
          formatting.insertFootnoteWithData(id, content);
        }}
      />
    </div>
  );
}
