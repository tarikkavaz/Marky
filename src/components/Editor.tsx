import { useEditor, EditorContent, type Editor as TipTapEditor, ReactNodeViewRenderer } from '@tiptap/react';
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
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { Extension } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { common, createLowlight } from 'lowlight';
import { useEffect, useRef } from 'react';
import { EditorContextMenu } from './EditorContextMenu';
import { CodeBlockComponent } from './CodeBlockComponent';
import { TableComponent } from './TableComponent';

// Create lowlight instance with common languages
const lowlight = createLowlight(common);

// Custom extension for Tab handling in lists
const TabHandler = Extension.create({
  name: 'tabHandler',
  
  addKeyboardShortcuts() {
    return {
      Tab: () => {
        // Handle Tab for lists (indent)
        // Check if we're in a list item context
        const { state } = this.editor;
        const { $from } = state.selection;
        
        // Check if we're inside a listItem
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name === 'listItem') {
            return this.editor.commands.sinkListItem('listItem');
          }
        }
        
        return false;
      },
      'Shift-Tab': () => {
        // Handle Shift+Tab for lists (outdent)
        const { state } = this.editor;
        const { $from } = state.selection;
        
        // Check if we're inside a listItem
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name === 'listItem') {
            return this.editor.commands.liftListItem('listItem');
          }
        }
        
      return false;
      },
    };
  },
});

interface EditorProps {
  content: string;
  onChange: (content: string) => void;
  onEditorReady?: (editor: TipTapEditor) => void;
  currentFilePath?: string | null;
}

// Create extensions outside component to prevent recreation during HMR
const editorExtensions = [
  StarterKit.configure({
    heading: {
      levels: [1, 2, 3, 4, 5, 6],
    },
    codeBlock: false, // Disable default code block
  }),
  TabHandler,
  CodeBlockLowlight.extend({
    addNodeView() {
      return ReactNodeViewRenderer(CodeBlockComponent, {
        contentDOMElementTag: 'code',
      });
    },
    addKeyboardShortcuts() {
      return {
        Tab: () => {
          // Only handle Tab in code blocks
          if (this.editor.isActive('codeBlock')) {
            // Insert 2 spaces
            return this.editor.commands.insertContent('  ');
          }
              return false;
        },
        'Shift-Tab': () => {
          // Only handle Shift+Tab in code blocks
          if (this.editor.isActive('codeBlock')) {
            const { state } = this.editor;
            const { selection } = state;
            const { $from } = selection;
            
            // Get the text before the cursor
            const textBefore = $from.parent.textContent.substring(0, $from.parentOffset);
            
            // Check if there are spaces before cursor that we can remove
            if (textBefore.endsWith('  ')) {
              // Remove 2 spaces
              const from = $from.pos - 2;
              const to = $from.pos;
              return this.editor.commands.deleteRange({ from, to });
            } else if (textBefore.endsWith(' ')) {
              // Remove 1 space if only 1 space exists
              const from = $from.pos - 1;
              const to = $from.pos;
              return this.editor.commands.deleteRange({ from, to });
            }
            return true;
        }
        return false;
        },
      };
    },
  }).configure({
    lowlight,
  }),
  Typography,
  Underline,
  Image.extend({
    addKeyboardShortcuts() {
      return {
        'Mod-Shift-i': () => {
          // This will be handled by the EditorContextMenu's insertImage function
          // Return false to allow the event to bubble up
          return false;
        },
      };
    },
    addAttributes() {
      return {
        ...this.parent?.(),
        'data-original-src': {
          default: null,
          parseHTML: element => element.getAttribute('data-original-src'),
          renderHTML: attributes => {
            if (!attributes['data-original-src']) {
              return {};
            }
            return {
              'data-original-src': attributes['data-original-src'],
            };
          },
        },
      };
    },
  }).configure({
    allowBase64: true,
    inline: false,
    HTMLAttributes: {
      class: 'max-w-full h-auto rounded',
    },
  }),
  Link.configure({
    openOnClick: false,
    HTMLAttributes: {
      class: 'text-blue-400 underline cursor-pointer',
    },
  }),
  Table.configure({
    resizable: true,
    allowTableNodeSelection: true,
  }).extend({
    addNodeView() {
      return ReactNodeViewRenderer(TableComponent, {
        contentDOMElementTag: 'table',
      });
    },
    addKeyboardShortcuts() {
      return {
        'Mod-t': () => {
          // This will be handled by the EditorContextMenu's insertTable function
          // Return false to allow the event to bubble up
          return false;
        },
        Backspace: () => {
          // Delete entire table when table node is selected
          const { state } = this.editor;
          const { selection } = state;
          
          // Check if this is a NodeSelection and it's a table
          if (selection instanceof NodeSelection && selection.node.type.name === 'table') {
            // Use TipTap's deleteTable command to delete the entire table
            return this.editor.commands.deleteTable();
          }
          
          return false;
        },
        Delete: () => {
          // Delete entire table when table node is selected
          const { state } = this.editor;
          const { selection } = state;
          
          // Check if this is a NodeSelection and it's a table
          if (selection instanceof NodeSelection && selection.node.type.name === 'table') {
            // Use TipTap's deleteTable command to delete the entire table
            return this.editor.commands.deleteTable();
          }
          
          return false;
        },
      };
    },
  }),
  TableRow,
  TableHeader,
  TableCell,
  Placeholder.configure({
    placeholder: 'Start writing...',
  }),
];

export function Editor({ content, onChange, onEditorReady, currentFilePath }: EditorProps) {
  const isUpdatingRef = useRef(false);
  const lastContentRef = useRef(content);

  const editor = useEditor({
    extensions: editorExtensions,
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
      <EditorContextMenu editor={editor} currentFilePath={currentFilePath}>
        <EditorContent editor={editor} className="w-full h-full overflow-y-auto" />
      </EditorContextMenu>
    </div>
  );
}
