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
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import { Extension, Node } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react';
import { common, createLowlight } from 'lowlight';
import type { ComponentType } from 'react';
import { AlertComponent, type AlertType } from '../Alert/AlertComponent';

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
        
        // Check if we're inside a listItem or taskItem
        for (let d = $from.depth; d > 0; d--) {
          const nodeType = $from.node(d).type.name;
          if (nodeType === 'listItem' || nodeType === 'taskItem') {
            return this.editor.commands.sinkListItem(nodeType);
          }
        }
        
        return false;
      },
      'Shift-Tab': () => {
        // Handle Shift+Tab for lists (outdent)
        const { state } = this.editor;
        const { $from } = state.selection;
        
        // Check if we're inside a listItem or taskItem
        for (let d = $from.depth; d > 0; d--) {
          const nodeType = $from.node(d).type.name;
          if (nodeType === 'listItem' || nodeType === 'taskItem') {
            return this.editor.commands.liftListItem(nodeType);
          }
        }
        
        return false;
      },
    };
  },
});

// Custom Alert extension for markdown callouts
export const Alert = Node.create({
  name: 'alert',
  group: 'block',
  content: 'block+',
  draggable: true,
  
  addAttributes() {
    return {
      type: {
        default: 'note',
        parseHTML: element => element.getAttribute('data-alert-type') || 'note',
        renderHTML: attributes => {
          if (!attributes.type) {
            return {};
          }
          return {
            'data-alert-type': attributes.type,
          };
        },
      },
    };
  },
  
  parseHTML() {
    return [
      {
        tag: 'div[data-alert-type]',
        getAttrs: (element) => {
          if (typeof element === 'string') return false;
          const type = element.getAttribute('data-alert-type');
          return type ? { type } : false;
        },
      },
      // Parse markdown-style blockquotes with alert syntax
      {
        tag: 'blockquote',
        getAttrs: (element) => {
          if (typeof element === 'string') return false;
          const text = element.textContent || '';
          const match = text.match(/^\[!(\w+)\]/);
          if (match) {
            const type = match[1].toLowerCase();
            if (['note', 'tip', 'important', 'warning', 'caution'].includes(type)) {
              return { type };
            }
          }
          return false;
        },
      },
    ];
  },
  
  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-alert-type': HTMLAttributes.type || 'note', class: 'alert' }, 0];
  },
  
  addCommands() {
    return {
      setAlert: (type: AlertType) => ({ commands }) => {
        return commands.wrapIn('alert', { type });
      },
      toggleAlert: (type: AlertType) => ({ commands }) => {
        return commands.toggleWrap('alert', { type });
      },
    };
  },
});

// Custom Footnote extension
export const Footnote = Node.create({
  name: 'footnote',
  group: 'block',
  content: 'paragraph+',
  defining: true,
  
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: element => {
          // Try to get ID from attribute
          const id = element.getAttribute('data-footnote-id');
          return id || null;
        },
        renderHTML: (id) => {
          // renderHTML in addAttributes receives the attribute value directly
          // Always render the attribute, even if empty (to maintain structure)
          const idValue = id || '';
          return {
            'data-footnote-id': idValue,
          };
        },
      },
    };
  },
  
  parseHTML() {
    return [
      {
        tag: 'div[data-footnote-id]',
        getAttrs: (element) => {
          if (typeof element === 'string') return false;
          const id = element.getAttribute('data-footnote-id');
          // Return false only if ID is truly missing (null/undefined), not if it's empty string
          // Empty string might be valid in some edge cases, but we'll still reject it
          if (!id || id === '') {
            return false;
          }
          return { id };
        },
      },
    ];
  },
  
  renderHTML({ HTMLAttributes, node }) {
    // Get ID from node attributes (most reliable) or HTMLAttributes
    const id = node?.attrs?.id || HTMLAttributes.id || HTMLAttributes['data-footnote-id'] || '';
    // Merge HTMLAttributes (which includes rendered attributes from addAttributes) with our custom attributes
    return ['div', { ...HTMLAttributes, 'data-footnote-id': id, class: 'footnote-definition' }, 0];
  },
});

// Footnote Reference extension
export const FootnoteReference = Node.create({
  name: 'footnoteReference',
  group: 'inline',
  inline: true,
  atom: true,
  
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: element => {
          // Try to get ID from attribute first
          let id = element.getAttribute('data-footnote-ref');
          // If attribute is empty, try to get from text content
          if (!id || id === '') {
            const textContent = element.textContent?.trim();
            if (textContent && /^\d+$/.test(textContent)) {
              id = textContent;
            }
          }
          return id || null;
        },
        renderHTML: (id) => {
          // renderHTML in addAttributes receives the attribute value directly
          // Always render the attribute, even if empty (to maintain structure)
          const idValue = id || '';
          return {
            'data-footnote-ref': idValue,
          };
        },
      },
    };
  },
  
  parseHTML() {
    return [
      {
        tag: 'sup[data-footnote-ref]',
        getAttrs: (element) => {
          if (typeof element === 'string') return false;
          const id = element.getAttribute('data-footnote-ref');
          // Also try to get ID from text content if attribute is empty
          if (!id || id === '') {
            const textContent = element.textContent?.trim();
            if (textContent && /^\d+$/.test(textContent)) {
              return { id: textContent };
            }
            return false;
          }
          return { id };
        },
      },
    ];
  },
  
  renderHTML({ HTMLAttributes, node }) {
    // Get ID from node attributes (most reliable) or HTMLAttributes
    const id = node?.attrs?.id || HTMLAttributes.id || HTMLAttributes['data-footnote-ref'] || '';
    // Merge HTMLAttributes (which includes rendered attributes from addAttributes) with our custom attributes
    return ['sup', { ...HTMLAttributes, 'data-footnote-ref': id, class: 'footnote-reference' }, id];
  },
  
  addCommands() {
    return {
      setFootnoteReference: (id: string) => ({ commands }) => {
        return commands.insertContent({
          type: 'footnoteReference',
          attrs: { id },
        });
      },
    };
  },
});

export function createEditorExtensions(
  CodeBlockComponent: ComponentType<ReactNodeViewProps>,
  TableComponent: ComponentType<ReactNodeViewProps>
) {
  return [
    StarterKit.configure({
      heading: {
        levels: [1, 2, 3, 4, 5, 6],
      },
      codeBlock: false, // Disable default code block
      link: false, // Disable - added explicitly below
      underline: false, // Disable - added explicitly below
      blockquote: true, // Enable blockquote
      horizontalRule: false, // Disable - added explicitly below
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
          'Mod-Shift-c': () => {
            // Toggle code block with Cmd+Shift+C
            return this.editor.commands.toggleCodeBlock();
          },
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
    TaskList,
    TaskItem.configure({
      nested: true,
    }),
    HorizontalRule,
    Alert.extend({
      addNodeView() {
        return ReactNodeViewRenderer(AlertComponent, {
          contentDOMElementTag: 'div',
        });
      },
    }),
    Footnote,
    FootnoteReference,
    Placeholder.configure({
      placeholder: 'Start writing...',
    }),
  ];
}
