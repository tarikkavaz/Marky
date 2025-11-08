import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import TurndownService from 'turndown';

export interface FileState {
  path: string | null;
  content: string;
  hasUnsavedChanges: boolean;
}

// Initialize Turndown for HTML to Markdown conversion
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  bulletListMarker: '-',
  preformattedCode: true,
  blankReplacement: (content, node) => {
    return node.isBlock ? '\n\n' : '';
  },
  keepReplacement: (content, node) => {
    return node.isBlock ? '\n\n' + node.outerHTML + '\n\n' : node.outerHTML;
  },
});

// Add custom rule for TipTap's code blocks
turndownService.addRule('codeBlock', {
  filter: (node) => {
    return node.nodeName === 'PRE' && node.firstChild?.nodeName === 'CODE';
  },
  replacement: (_content, node) => {
    const codeElement = node.firstChild as HTMLElement;
    const language = codeElement.className.replace('language-', '') || '';
    return '\n\n```' + language + '\n' + codeElement.textContent + '\n```\n\n';
  },
});

// Convert Markdown to HTML for editor
function markdownToHTML(markdown: string): string {
  const html = markdown
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold and italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Code blocks (must come before inline code)
    .replace(/```(\w+)?\n?([\s\S]+?)```/g, (_, lang, code) => 
      `<pre><code class="language-${lang || 'plaintext'}">${code.trim()}</code></pre>`)
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    // Paragraphs - split by double newlines
    .split('\n\n')
    .map(para => {
      // Skip already processed block elements
      if (para.match(/^<(h\d|ul|pre|table)/)) {
        return para;
      }
      // Skip empty paragraphs
      if (para.trim() === '') {
        return '';
      }
      // Handle line breaks within paragraphs (two spaces + newline in markdown)
      const processedPara = para
        .replace(/  \n/g, '<br>')  // Two spaces + newline = <br>
        .replace(/\n/g, '<br>');   // Single newlines also become <br> within a paragraph
      return `<p>${processedPara}</p>`;
    })
    .filter(para => para !== '')  // Remove empty strings
    .join('\n\n');  // Join with double newlines to separate paragraphs

  return html;
}

// Convert HTML to Markdown for saving
function htmlToMarkdown(html: string): string {
  try {
    // Clean up TipTap's HTML structure
    const cleanedHtml = html
      .replace(/<p><\/p>/g, '\n\n') // Empty paragraphs to double newlines
      .replace(/<br\s*\/?>/g, '  \n'); // BR tags to markdown line breaks (two spaces + newline)
    
    const markdown = turndownService.turndown(cleanedHtml);
    
    // Clean up excessive whitespace while preserving paragraph breaks
    const finalMarkdown = markdown
      .replace(/\n{4,}/g, '\n\n') // More than 3 newlines to double newlines
      .replace(/[ \t]+$/gm, '') // Remove trailing spaces from lines
      .trim();
    
    return finalMarkdown;
  } catch (error) {
    console.error('Error converting HTML to Markdown:', error);
    console.error('HTML content:', html);
    return html; // Return original HTML if conversion fails
  }
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

    const markdownContent = await readTextFile(filePath);
    // Convert Markdown to HTML for the editor
    const htmlContent = markdownToHTML(markdownContent);
    return { path: filePath, content: htmlContent };
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

    // Convert HTML to Markdown before saving
    const markdownContent = htmlToMarkdown(content);
    await writeTextFile(filePath, markdownContent);
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

    // Convert HTML to Markdown before saving
    const markdownContent = htmlToMarkdown(content);
    await writeTextFile(filePath, markdownContent);
    return filePath;
  } catch (error) {
    console.error('Error saving file as:', error);
    throw error;
  }
}

export function exportToHTML(content: string): string {
  // Simple markdown to HTML conversion
  // This is a basic implementation - can be enhanced later
  const html = content
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
