import type { Editor } from '@tiptap/react';
import { open, message } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { TextSelection } from '@tiptap/pm/state';
import type { AlertType } from '../Alert/AlertComponent';

// Formatting commands
export const createFormattingCommands = (editor: Editor) => ({
  toggleBold: () => editor.chain().focus().toggleBold().run(),
  toggleItalic: () => editor.chain().focus().toggleItalic().run(),
  toggleUnderline: () => editor.chain().focus().toggleUnderline().run(),
  toggleCode: () => editor.chain().focus().toggleCode().run(),
  toggleCodeBlock: () => {
    const { state } = editor;
    const { selection } = state;
    const { from, to } = selection;
    
    // Check if there's a non-empty selection
    if (from !== to) {
      const selectedText = state.doc.textBetween(from, to, '\n');
      
      // Check if selection spans multiple lines or contains newlines
      if (selectedText.includes('\n') || selectedText.split('\n').length > 1) {
        // Wrap selection in code block using ProseMirror transaction
        const { tr } = state;
        const codeBlockType = state.schema.nodes.codeBlock;
        
        if (codeBlockType) {
          // Delete the selection
          tr.delete(from, to);
          
          // Create code block node with the selected text
          const codeBlockNode = codeBlockType.create({}, state.schema.text(selectedText));
          
          // Insert the code block at the deletion position
          tr.insert(from, codeBlockNode);
          
          // Set selection to the end of the code block
          const newPos = from + codeBlockNode.nodeSize - 1;
          tr.setSelection(TextSelection.near(tr.doc.resolve(newPos)));
          
          // Dispatch the transaction
          editor.view.dispatch(tr);
          return true;
        }
      }
    }
    
    // Default toggle behavior for single line or no selection
    return editor.chain().focus().toggleCodeBlock().run();
  },
  toggleHeading: (level: 1 | 2 | 3 | 4 | 5 | 6) => 
    editor.chain().focus().toggleHeading({ level }).run(),
  toggleBulletList: () => editor.chain().focus().toggleBulletList().run(),
  toggleOrderedList: () => editor.chain().focus().toggleOrderedList().run(),
  toggleTaskList: () => editor.chain().focus().toggleTaskList().run(),
  toggleBlockquote: () => editor.chain().focus().toggleBlockquote().run(),
  insertHorizontalRule: () => editor.chain().focus().setHorizontalRule().run(),
  indentList: () => {
    // Try to indent - TipTap will handle if we're in a list
    const result = editor.chain().focus().sinkListItem('listItem').run();
    if (!result) {
      // Try task item if regular list didn't work
      return editor.chain().focus().sinkListItem('taskItem').run();
    }
    return result;
  },
  outdentList: () => {
    // Try to outdent - TipTap will handle if we're in a list
    const result = editor.chain().focus().liftListItem('listItem').run();
    if (!result) {
      // Try task item if regular list didn't work
      return editor.chain().focus().liftListItem('taskItem').run();
    }
    return result;
  },
  insertAlert: (type: AlertType) => editor.chain().focus().setAlert(type).run(),
  insertFootnote: () => {
    // This will be handled by the dialog - return a signal
    return true;
  },
  insertFootnoteWithData: (id: string, content: string) => {
    try {
      console.log('Inserting footnote with ID:', id, 'Content:', content);
      
      // Validate ID
      if (!id || id.trim() === '') {
        console.error('Invalid footnote ID:', id);
        return false;
      }
      
      const trimmedId = id.trim();
      
      // Insert footnote reference at cursor
      const refResult = editor.chain().focus().setFootnoteReference(trimmedId).run();
      if (!refResult) {
        console.error('Failed to insert footnote reference');
        return false;
      }
      
      // Verify the reference was inserted correctly by checking the HTML output
      setTimeout(() => {
        const html = editor.getHTML();
        const refMatches = html.match(/<sup[^>]*data-footnote-ref="([^"]*)"[^>]*>/g);
        if (refMatches) {
          console.log('Found footnote references in HTML:', refMatches);
          const lastMatch = refMatches[refMatches.length - 1];
          const idMatch = lastMatch.match(/data-footnote-ref="([^"]*)"/);
          if (idMatch) {
            const actualId = idMatch[1];
            console.log('Last inserted footnote reference ID:', actualId);
            if (actualId !== trimmedId) {
              console.warn('ID mismatch! Expected:', trimmedId, 'Got:', actualId);
            }
          }
        }
      }, 100);
      
      // Insert footnote definition at the end of the document
      const { state } = editor;
      const doc = state.doc;
      const endPos = doc.content.size;
      
      // Create paragraph with content
      const paragraph = editor.schema.nodes.paragraph.create({}, editor.schema.text(content));
      const footnoteDef = editor.schema.nodes.footnote.create({ id: trimmedId }, [paragraph]);
      
      console.log('Creating footnote definition with ID:', trimmedId);
      console.log('Footnote definition node:', footnoteDef);
      
      // Insert at the end - add a paragraph break before the footnote definition
      const tr = state.tr;
      tr.insert(endPos, [editor.schema.nodes.paragraph.create(), footnoteDef]);
      editor.view.dispatch(tr);
      
      return true;
    } catch (error) {
      console.error('Error inserting footnote:', error);
      console.error('Error details:', error);
      return false;
    }
  },
  handleUndo: () => editor.chain().focus().undo().run(),
  handleRedo: () => editor.chain().focus().redo().run(),
  canUndo: () => editor.can().undo(),
  canRedo: () => editor.can().redo(),
  isActive: (name: string, attrs?: Record<string, unknown>) => 
    editor.isActive(name, attrs),
});

// Insertion commands
export const createInsertionCommands = (editor: Editor) => ({
  insertImage: async () => {
    try {
      const filePath = await open({
        multiple: false,
        filters: [{
          name: 'Images',
          extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']
        }]
      });
      
      if (filePath && typeof filePath === 'string') {
        // Read the image and convert to base64 for display
        const imageData = await readFile(filePath);
        
        // Detect image type from extension
        const ext = filePath.split('.').pop()?.toLowerCase() || 'png';
        const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
        
        // Convert to base64
        const base64 = btoa(String.fromCharCode(...imageData));
        const dataUrl = `data:${mimeType};base64,${base64}`;
        
        // Insert image with base64 src
        editor.chain().focus().setImage({ 
          src: dataUrl
        }).run();
      }
    } catch (error) {
      console.error('Failed to insert image:', error);
      await message('Failed to insert image. Please try again.', {
        title: 'Error',
        kind: 'error'
      });
    }
  },

  insertLink: async () => {
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, ' ');
    
    if (!selectedText || selectedText.trim() === '') {
      await message('Please select some text first to add a link', { 
        title: 'No Text Selected', 
        kind: 'info' 
      });
      return null;
    }
    
    return true; // Signal that dialog should open
  },

  setLink: (url: string) => {
    if (url && url.trim()) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
  },

  insertTable: (rows: number, cols: number) => {
    editor.chain().focus().insertTable({ 
      rows, 
      cols, 
      withHeaderRow: true 
    }).run();
  },
});
