import { useEditor, EditorContent, type Editor as TipTapEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import Underline from '@tiptap/extension-underline';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { useEffect, useRef } from 'react';

interface EditorProps {
  content: string;
  onChange: (content: string) => void;
  onEditorReady?: (editor: TipTapEditor) => void;
}

// Create extensions outside component to prevent recreation during HMR
const editorExtensions = [
  StarterKit.configure({
    heading: {
      levels: [1, 2, 3],
    },
    history: false,
  }),
  Typography,
  Underline,
  Image,
  Link.configure({
    openOnClick: false,
    HTMLAttributes: {
      class: 'text-blue-400 underline cursor-pointer',
    },
  }),
  Table.configure({
    resizable: true,
  }),
  TableRow,
  TableHeader,
  TableCell,
  Placeholder.configure({
    placeholder: 'Start writing...',
  }),
];

export function Editor({ content, onChange, onEditorReady }: EditorProps) {
  const isUpdatingRef = useRef(false);
  const lastContentRef = useRef(content);

  const editor = useEditor({
    extensions: editorExtensions,
    content,
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none focus:outline-none min-h-full p-8',
      },
    },
    onUpdate: ({ editor }) => {
      if (isUpdatingRef.current) return;
      
      // Get HTML content from editor (temporary - not converting to markdown yet)
      const html = editor.getHTML();
      lastContentRef.current = html;
      onChange(html);
    },
    onCreate: ({ editor }) => {
      onEditorReady?.(editor);
    },
  });

  // Cleanup editor on unmount
  useEffect(() => {
    return () => {
      if (editor && !editor.isDestroyed) {
        editor.destroy();
      }
    };
  }, [editor]);

  // Update editor content when prop changes (from file operations, undo/redo, etc.)
  useEffect(() => {
    if (!editor) return;
    
    // Only update if content is different from what we last set
    if (content !== lastContentRef.current) {
    isUpdatingRef.current = true;
      // Set content directly (temporary - not converting from markdown yet)
      editor.commands.setContent(content);
      lastContentRef.current = content;
      setTimeout(() => {
        isUpdatingRef.current = false;
      }, 0);
    }
  }, [content, editor]);

  if (!editor) {
    return (
      <div className="w-full h-full overflow-hidden flex items-center justify-center">
        <p className="text-muted-foreground">Loading editor...</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-hidden">
      <EditorContent editor={editor} className="w-full h-full overflow-y-auto" />
    </div>
  );
}
