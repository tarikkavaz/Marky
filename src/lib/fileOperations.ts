import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile, readFile } from '@tauri-apps/plugin-fs';
import { dirname } from '@tauri-apps/api/path';
import TurndownService from 'turndown';
import { tables } from 'turndown-plugin-gfm';
import { imageUrlToMarkdownPath, markdownPathToImageUrl } from './imageHandler';

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

// Use GFM tables plugin for markdown table conversion
turndownService.use(tables);

// Prevent escaping of square brackets in image/link paths
turndownService.escape = (text) => {
  // Don't escape anything - keep the original text
  return text;
};

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
async function markdownToHTML(markdown: string, markdownPath: string | null): Promise<string> {
  let html = markdown
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Images (must come before bold/italic to avoid conflicts with ![alt])
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
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
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  
  // Convert markdown tables to HTML (must be done before paragraph splitting)
  html = html.replace(/(\|.+\|[\r\n]+)+/g, (match) => {
    const rows = match.trim().split('\n').filter(row => row.trim());
    if (rows.length < 2) return match; // Need at least header + separator
    
    // Check if second row is separator (e.g., | --- | --- |)
    const isSeparator = rows[1].match(/^\|[\s-:|]+\|$/);
    if (!isSeparator) return match; // Not a valid table
    
    // Build HTML table
    let tableHtml = '<table>';
    
    // Header row
    const headerCells = rows[0].split('|').filter(c => c.trim()).map(c => c.trim());
    tableHtml += '<thead><tr>';
    headerCells.forEach(cell => {
      tableHtml += `<th>${cell}</th>`;
    });
    tableHtml += '</tr></thead>';
    
    // Body rows (skip separator)
    if (rows.length > 2) {
      tableHtml += '<tbody>';
      for (let i = 2; i < rows.length; i++) {
        const cells = rows[i].split('|').filter(c => c.trim()).map(c => c.trim());
        tableHtml += '<tr>';
        cells.forEach(cell => {
          tableHtml += `<td>${cell}</td>`;
        });
        tableHtml += '</tr>';
      }
      tableHtml += '</tbody>';
    }
    
    tableHtml += '</table>';
    return tableHtml;
  });
  
  html = html
    // Paragraphs - split by double newlines
    .split('\n\n')
    .map(para => {
      // Skip already processed block elements and images
      if (para.match(/^<(h\d|ul|pre|table|img)/)) {
        return para;
      }
      // Skip empty paragraphs
      if (para.trim() === '') {
        return '';
      }
      // Skip paragraphs that contain images
      if (para.includes('<img')) {
        return para;
      }
      // Handle line breaks within paragraphs (two spaces + newline in markdown)
      const processedPara = para
        .replace(/  \n/g, '<br>')  // Two spaces + newline = <br>
        .replace(/\n/g, '<br>');   // Single newlines also become <br> within a paragraph
      return `<p>${processedPara}</p>`;
    })
    .filter(para => para !== '')  // Remove empty strings
    .join('\n\n');  // Join with double newlines to separate paragraphs

  // Convert image paths to Tauri asset URLs AFTER paragraph processing
  if (markdownPath) {
    html = await convertImagePathsToUrls(html, markdownPath);
  }

  return html;
}

// Helper function to convert image paths to base64 data URLs while preserving original path
async function convertImagePathsToUrls(html: string, _markdownPath: string): Promise<string> {
  const imgRegex = /<img([^>]*?)src="([^"]+)"([^>]*?)>/g;
  const matches = [...html.matchAll(imgRegex)];
  
  let result = html;
  for (const match of matches) {
    const [fullMatch, before, src, after] = match;
    
    // Skip if already has data-original-src (already processed)
    if (fullMatch.includes('data-original-src')) {
      continue;
    }
    
    // Skip if already a data URL
    if (src.startsWith('data:')) {
      continue;
    }
    
    // Convert to base64 data URL but preserve original path in data attribute
    try {
      const imageData = await readFile(src);
      
      // Detect image type from extension
      const ext = src.split('.').pop()?.toLowerCase() || 'png';
      const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
      
      // Convert to base64
      const base64 = btoa(String.fromCharCode(...imageData));
      const dataUrl = `data:${mimeType};base64,${base64}`;
      
      // Store original path in data-original-src attribute
      result = result.replace(fullMatch, `<img${before}src="${dataUrl}" data-original-src="${src}"${after}>`);
    } catch (error) {
      console.error(`Failed to load image ${src}:`, error);
      // Keep original if conversion fails
    }
  }
  
  return result;
}

// Convert HTML to Markdown for saving
async function htmlToMarkdown(html: string, markdownPath: string | null): Promise<string> {
  try {
    // Restore original file paths from data-original-src attribute
    let processedHtml = html;
    if (markdownPath) {
      const markdownDir = await dirname(markdownPath);
      // Find all img tags with src
      processedHtml = html.replace(/<img([^>]*?)src="([^"]+)"([^>]*?)>/g, (match, before, src, after) => {
        // Check if data-original-src attribute exists
        const dataOriginalMatch = match.match(/data-original-src="([^"]+)"/);
        const originalSrc = dataOriginalMatch ? dataOriginalMatch[1] : src;
        
        // Use the original path if available, otherwise try to convert the src
        const absolutePath = dataOriginalMatch ? originalSrc : imageUrlToMarkdownPath(src, markdownDir);
        
        // Remove data-original-src from the output
        const cleanedBefore = before.replace(/\s*data-original-src="[^"]*"/, '');
        const cleanedAfter = after.replace(/\s*data-original-src="[^"]*"/, '');
        
        return `<img${cleanedBefore}src="${absolutePath}"${cleanedAfter}>`;
      });
    }
    
    // Clean up TipTap's HTML structure
    let cleanedHtml = processedHtml
      .replace(/<p><\/p>/g, '\n\n') // Empty paragraphs to double newlines
      .replace(/<br\s*\/?>/g, '  \n'); // BR tags to markdown line breaks (two spaces + newline)
    
    // Remove <p> tags inside table cells for better GFM conversion
    cleanedHtml = cleanedHtml.replace(/<(th|td)([^>]*)><p>([\s\S]*?)<\/p><\/(th|td)>/g, '<$1$2>$3</$4>');
    
    // Clean up TipTap's table HTML for GFM plugin compatibility
    if (cleanedHtml.includes('<table')) {
      cleanedHtml = cleanedHtml
        // Remove style attributes from table elements
        .replace(/<table[^>]*>/g, '<table>')
        .replace(/<(th|td|tr)[^>]*>/g, '<$1>')
        // Remove colgroup elements
        .replace(/<colgroup>[\s\S]*?<\/colgroup>/g, '')
        // Remove tbody/thead/tfoot wrappers (keep content)
        .replace(/<\/?tbody>/g, '')
        .replace(/<\/?thead>/g, '')
        .replace(/<\/?tfoot>/g, '');
    }
    
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
    const htmlContent = await markdownToHTML(markdownContent, filePath);
    
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
    const markdownContent = await htmlToMarkdown(content, filePath);
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
    const markdownContent = await htmlToMarkdown(content, filePath);
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
