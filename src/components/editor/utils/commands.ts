import type { Editor } from '@tiptap/react';
import { open, message } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';

// Formatting commands
export const createFormattingCommands = (editor: Editor) => ({
  toggleBold: () => editor.chain().focus().toggleBold().run(),
  toggleItalic: () => editor.chain().focus().toggleItalic().run(),
  toggleUnderline: () => editor.chain().focus().toggleUnderline().run(),
  toggleCode: () => editor.chain().focus().toggleCode().run(),
  toggleCodeBlock: () => editor.chain().focus().toggleCodeBlock().run(),
  toggleHeading: (level: 1 | 2 | 3 | 4 | 5 | 6) => 
    editor.chain().focus().toggleHeading({ level }).run(),
  toggleBulletList: () => editor.chain().focus().toggleBulletList().run(),
  toggleOrderedList: () => editor.chain().focus().toggleOrderedList().run(),
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
