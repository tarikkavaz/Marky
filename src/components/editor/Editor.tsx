import { useEditor, EditorContent, type Editor as TipTapEditor } from '@tiptap/react';
import { useEffect, useRef } from 'react';
import { EditorContextMenu } from './EditorContextMenu';
import { createEditorExtensions } from './utils/extensions';
import { CodeBlockComponent } from './CodeBlock/CodeBlockComponent';
import { TableComponent } from './Table/TableComponent';
import { SourceView } from './SourceView';

interface EditorProps {
  content: string;
  onChange: (content: string) => void;
  onEditorReady?: (editor: TipTapEditor) => void;
  currentFilePath?: string | null;
  showSource?: boolean;
  markdownContent?: string;
  onMarkdownChange?: (markdown: string) => void;
}

export function Editor({ content, onChange, onEditorReady, currentFilePath, showSource = false, markdownContent = '', onMarkdownChange }: EditorProps) {
  const isUpdatingRef = useRef(false);
  const lastContentRef = useRef(content);

  const editor = useEditor({
    extensions: createEditorExtensions(CodeBlockComponent, TableComponent),
    content,
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none focus:outline-none min-h-full p-8',
      },
      handleClick: (view, pos, event) => {
        const target = event.target as HTMLElement;
        
        // Check if clicking on a footnote reference
        const footnoteRef = target.closest('.footnote-reference');
        if (footnoteRef) {
          const footnoteId = footnoteRef.getAttribute('data-footnote-ref');
          if (footnoteId) {
            // Find the corresponding footnote definition
            const editorElement = view.dom;
            const footnoteDef = editorElement.querySelector(
              `.footnote-definition[data-footnote-id="${footnoteId}"]`
            ) as HTMLElement;
            
            if (footnoteDef) {
              event.preventDefault();
              footnoteDef.scrollIntoView({ behavior: 'smooth', block: 'center' });
              // Highlight briefly
              footnoteDef.style.transition = 'background-color 0.3s';
              const originalBg = footnoteDef.style.backgroundColor;
              footnoteDef.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
              setTimeout(() => {
                footnoteDef.style.backgroundColor = originalBg;
              }, 1000);
              return true;
            }
          }
        }
        
        // Check if clicking on a footnote definition (scroll back to reference)
        const footnoteDef = target.closest('.footnote-definition');
        if (footnoteDef) {
          const footnoteId = footnoteDef.getAttribute('data-footnote-id');
          if (footnoteId) {
            // Find the first footnote reference with this ID
            const editorElement = view.dom;
            const footnoteRefs = editorElement.querySelectorAll(
              `.footnote-reference[data-footnote-ref="${footnoteId}"]`
            );
            
            if (footnoteRefs.length > 0) {
              event.preventDefault();
              const firstRef = footnoteRefs[0] as HTMLElement;
              firstRef.scrollIntoView({ behavior: 'smooth', block: 'center' });
              // Highlight briefly
              firstRef.style.transition = 'background-color 0.3s';
              const originalBg = firstRef.style.backgroundColor;
              firstRef.style.backgroundColor = 'rgba(59, 130, 246, 0.4)';
              setTimeout(() => {
                firstRef.style.backgroundColor = originalBg;
              }, 1000);
              return true;
            }
          }
        }
        
        return false;
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

  // Show source view if enabled
  if (showSource && onMarkdownChange) {
    return (
      <div className="w-full h-full overflow-hidden">
        <SourceView
          markdown={markdownContent}
          onChange={onMarkdownChange}
          editor={editor}
          currentFilePath={currentFilePath}
        />
      </div>
    );
  }

  // Show preview (normal editor)
  return (
    <div className="w-full h-full overflow-hidden">
      <EditorContextMenu editor={editor} currentFilePath={currentFilePath}>
        <EditorContent editor={editor} className="w-full h-full overflow-y-auto" />
      </EditorContextMenu>
    </div>
  );
}
