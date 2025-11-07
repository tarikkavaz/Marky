import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Typography from '@tiptap/extension-typography';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { useEffect, useRef } from 'react';

interface EditorProps {
  content: string;
  onChange: (content: string) => void;
}

export function Editor({ content, onChange }: EditorProps) {
  const isUpdatingRef = useRef(false);
  const lastContentRef = useRef(content);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        // Disable TipTap's history since we're using the app's undo/redo
        history: false,
      }),
      Markdown.configure({
        html: true,
        transformPastedText: true,
        transformCopiedText: true,
      }),
      Typography,
      Placeholder.configure({
        placeholder: 'Start writing...',
      }),
    ],
    content,
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none focus:outline-none min-h-full p-8',
      },
    },
    onUpdate: ({ editor }) => {
      if (isUpdatingRef.current) return;
      
      // Get markdown content from editor
      const markdown = editor.storage.markdown?.getMarkdown?.() || editor.getText() || '';
      lastContentRef.current = markdown;
      onChange(markdown);
    },
  });

  // Update editor content when prop changes (from file operations, undo/redo, etc.)
  useEffect(() => {
    if (!editor) return;
    
    // Only update if content is different from what we last set
    if (content !== lastContentRef.current) {
      isUpdatingRef.current = true;
      editor.commands.setContent(content);
      lastContentRef.current = content;
      setTimeout(() => {
        isUpdatingRef.current = false;
      }, 0);
    }
  }, [content, editor]);

  return (
    <div className="w-full h-full overflow-hidden">
      <EditorContent editor={editor} className="w-full h-full overflow-y-auto" />
    </div>
  );
}
