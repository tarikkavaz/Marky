import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Typography from '@tiptap/extension-typography';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useRef } from 'react';
import { MarkdownParser, MarkdownSerializer, defaultMarkdownParser, defaultMarkdownSerializer } from 'prosemirror-markdown';
import { schema } from 'prosemirror-markdown';

interface EditorProps {
  content: string;
  onChange: (content: string) => void;
}

// Custom markdown parser/serializer for TipTap's schema
function parseMarkdown(markdown: string, editorSchema: any) {
  try {
    // Use prosemirror-markdown's parser with TipTap's schema
    const parser = new MarkdownParser(
      editorSchema,
      defaultMarkdownParser.tokenizer,
      defaultMarkdownParser.tokens
    );
    return parser.parse(markdown);
  } catch (error) {
    console.error('Failed to parse markdown:', error);
    // Fallback: return markdown as-is
    return editorSchema.text(markdown);
  }
}

function serializeToMarkdown(doc: any) {
  try {
    return defaultMarkdownSerializer.serialize(doc);
  } catch (error) {
    console.error('Failed to serialize to markdown:', error);
    return doc.textContent;
  }
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
      Typography,
      Placeholder.configure({
        placeholder: 'Start writing...',
      }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none focus:outline-none min-h-full p-8',
      },
    },
    onUpdate: ({ editor }) => {
      if (isUpdatingRef.current) return;
      
      // Serialize to markdown
      const markdown = serializeToMarkdown(editor.state.doc);
      lastContentRef.current = markdown;
      onChange(markdown);
    },
  });

  // Parse initial content
  useEffect(() => {
    if (editor && content && !editor.state.doc.textContent) {
      isUpdatingRef.current = true;
      try {
        const doc = parseMarkdown(content, editor.schema);
        editor.commands.setContent(doc.toJSON());
      } catch {
        // Fallback to plain content
        editor.commands.setContent(content);
      }
      lastContentRef.current = content;
      setTimeout(() => {
        isUpdatingRef.current = false;
      }, 0);
    }
  }, [editor]);

  // Update editor content when prop changes (from file operations, undo/redo, etc.)
  useEffect(() => {
    if (!editor) return;
    
    // Only update if content is different from what we last set
    if (content !== lastContentRef.current) {
      isUpdatingRef.current = true;
      try {
        const doc = parseMarkdown(content, editor.schema);
        editor.commands.setContent(doc.toJSON());
      } catch {
        // Fallback to plain content
        editor.commands.setContent(content);
      }
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
