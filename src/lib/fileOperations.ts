import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';

export interface FileState {
  path: string | null;
  content: string;
  hasUnsavedChanges: boolean;
}

export async function openFile(): Promise<{ path: string; content: string } | null> {
  try {
    const filePath = await open({
      filters: [
        { name: 'Text Files', extensions: ['txt', 'md', 'markdown'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      multiple: false,
    });

    if (!filePath || typeof filePath !== 'string') {
      return null;
    }

    const content = await readTextFile(filePath);
    return { path: filePath, content };
  } catch (error) {
    console.error('Error opening file:', error);
    throw error;
  }
}

export async function saveFile(content: string, currentPath: string | null): Promise<string | null> {
  try {
    let filePath = currentPath;

    if (!filePath) {
      filePath = await save({
        filters: [
          { name: 'Markdown Files', extensions: ['md'] },
          { name: 'Text Files', extensions: ['txt'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        defaultPath: 'untitled.md',
      });

      if (!filePath || typeof filePath !== 'string') {
        return null;
      }
    }

    await writeTextFile(filePath, content);
    return filePath;
  } catch (error) {
    console.error('Error saving file:', error);
    throw error;
  }
}

export async function saveFileAs(content: string): Promise<string | null> {
  try {
    const filePath = await save({
      filters: [
        { name: 'Markdown Files', extensions: ['md'] },
        { name: 'Text Files', extensions: ['txt'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      defaultPath: 'untitled.md',
    });

    if (!filePath || typeof filePath !== 'string') {
      return null;
    }

    await writeTextFile(filePath, content);
    return filePath;
  } catch (error) {
    console.error('Error saving file as:', error);
    throw error;
  }
}

export function exportToHTML(content: string): string {
  // Simple markdown to HTML conversion
  // This is a basic implementation - can be enhanced later
  let html = content
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\n/g, '<br>');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Marky Export</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      line-height: 1.6;
      color: #333;
      background: #fff;
    }
    code {
      background: #f4f4f4;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
    }
  </style>
</head>
<body>
  ${html}
</body>
</html>`;
}

export async function exportToHTMLFile(content: string): Promise<string | null> {
  try {
    const htmlContent = exportToHTML(content);
    const filePath = await save({
      filters: [{ name: 'HTML Files', extensions: ['html'] }],
      defaultPath: 'export.html',
    });

    if (!filePath || typeof filePath !== 'string') {
      return null;
    }

    await writeTextFile(filePath, htmlContent);
    return filePath;
  } catch (error) {
    console.error('Error exporting to HTML:', error);
    throw error;
  }
}
