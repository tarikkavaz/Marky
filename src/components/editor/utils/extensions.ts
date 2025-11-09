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
import { ReactNodeViewRenderer } from '@tiptap/react';
import { common, createLowlight } from 'lowlight';
import type { ComponentType } from 'react';

// Create lowlight instance with common languages
const lowlight = createLowlight(common);

// Custom extension for Tab handling in lists
export const TabHandler = Extension.create({
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

export function createEditorExtensions(
  CodeBlockComponent: ComponentType<any>,
  TableComponent: ComponentType<any>
) {
  return [
    StarterKit.configure({
      heading: {
        levels: [1, 2, 3, 4, 5, 6],
      },
      codeBlock: false, // Disable default code block
      link: false, // Disable - added explicitly below
      underline: false, // Disable - added explicitly below
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
}
