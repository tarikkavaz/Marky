import { useEditor, EditorContent, type Editor as TipTapEditor } from '@tiptap/react';
import { useEffect, useRef } from 'react';
import { EditorContextMenu } from './EditorContextMenu';
import { createEditorExtensions } from './utils/extensions';
import { CodeBlockComponent } from './CodeBlock/CodeBlockComponent';
import { TableComponent } from './Table/TableComponent';

interface EditorProps {
  content: string;
  onChange: (content: string) => void;
  onEditorReady?: (editor: TipTapEditor) => void;
  currentFilePath?: string | null;
}

export function Editor({ content, onChange, onEditorReady, currentFilePath }: EditorProps) {
  const isUpdatingRef = useRef(false);
  const lastContentRef = useRef(content);

  const editor = useEditor({
    extensions: createEditorExtensions(CodeBlockComponent, TableComponent),
    content,
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none focus:outline-none min-h-full p-8',
      },
      handlePaste: (view, event) => {
        // Check if HTML is available - if so, let TipTap handle it (for tables, code blocks, etc.)
        const html = event.clipboardData?.getData('text/html');
        if (html && (html.includes('<table') || html.includes('<pre') || html.includes('<code'))) {
          // Let TipTap handle HTML paste for structured content
          return false;
        }
        
        const text = event.clipboardData?.getData('text/plain');
        if (!text) return false;
        
        // Split by double newlines to get paragraphs
        const paragraphs = text.split(/\n\n+/).filter(p => p.trim());
        
        if (paragraphs.length <= 1) {
          // Single paragraph, use default behavior
          return false;
        }
        
        // Multiple paragraphs - insert them properly
        const { state } = view;
        const { tr } = state;
        const { from } = state.selection;
        
        // Build the content
        let offset = from;
        paragraphs.forEach((para, index) => {
          const cleanText = para.replace(/\n/g, ' ').trim();
          tr.insertText(cleanText, offset);
          offset += cleanText.length;
          
          // Add paragraph break except after the last one
          if (index < paragraphs.length - 1) {
            // Split the paragraph to create a new one
            tr.split(offset);
            offset += 1;
          }
        });
        
        view.dispatch(tr);
        return true;
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
      // Defer content update to avoid flushSync during render
      requestAnimationFrame(() => {
        editor.commands.setContent(content);
        lastContentRef.current = content;
        setTimeout(() => {
          isUpdatingRef.current = false;
        }, 0);
      });
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
      <EditorContextMenu editor={editor} currentFilePath={currentFilePath}>
        <EditorContent editor={editor} className="w-full h-full overflow-y-auto" />
      </EditorContextMenu>
    </div>
  );
}
