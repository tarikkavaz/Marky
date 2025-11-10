import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile, readFile } from '@tauri-apps/plugin-fs';
import { dirname } from '@tauri-apps/api/path';
import TurndownService from 'turndown';
// @ts-ignore - no types available for turndown-plugin-gfm
import { tables } from 'turndown-plugin-gfm';
import { imageUrlToMarkdownPath } from './imageHandler';

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
  blankReplacement: (_content, node) => {
    return (node as any).isBlock ? '\n\n' : '';
  },
  keepReplacement: (_content, node) => {
    return (node as any).isBlock ? '\n\n' + node.outerHTML + '\n\n' : node.outerHTML;
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

// Add custom rule for task lists
turndownService.addRule('taskList', {
  filter: (node) => {
    return node.nodeName === 'UL' && (node as HTMLElement).getAttribute('data-type') === 'taskList';
  },
  replacement: (content) => {
    return '\n' + content + '\n';
  },
});

// Add custom rule for task items
turndownService.addRule('taskItem', {
  filter: (node) => {
    return node.nodeName === 'LI' && (node as HTMLElement).getAttribute('data-type') === 'taskItem';
  },
  replacement: (content, node) => {
    const checkbox = (node as HTMLElement).querySelector('input[type="checkbox"]') as HTMLInputElement;
    const isChecked = checkbox?.checked || false;
    const text = content.trim();
    
    // Calculate nesting level and add appropriate indentation (2 spaces per level)
    const level = getNestingLevel(node);
    const indent = '  '.repeat(level);
    
    return `${indent}- [${isChecked ? 'x' : ' '}] ${text}\n`;
  },
});

// Helper function to calculate nesting level by counting LI ancestors
function getNestingLevel(node: Node): number {
  let level = 0;
  let current: Node | null = node.parentNode; // Start from parent since node is the LI itself
  
  // Walk up the DOM tree and count LI ancestors
  while (current) {
    if ((current as HTMLElement).nodeName === 'LI') {
      level++;
    }
    current = current.parentNode;
  }
  
  return level;
}

// Post-process markdown to fix nested list indentation
function fixNestedListIndentation(markdown: string): string {
  const lines = markdown.split('\n');
  const result: string[] = [];
  let i = 0;
  
  while (i < lines.length) {
    const line = lines[i];
    
    // Check if this is a list item (including task lists)
    const listItemMatch = line.match(/^(\s*)([-*]|\d+\.)\s+(.+)$/);
    const taskItemMatch = line.match(/^(\s*)- \[([ x])\]\s+(.+)$/);
    
    if (listItemMatch || taskItemMatch) {
      const match = listItemMatch || taskItemMatch!;
      const indent = match[1];
      const indentLevel = indent.length;
      
      // Look ahead to find nested items (skip empty lines)
      let j = i + 1;
      let emptyLinesCount = 0;
      
      // Skip initial empty lines
      while (j < lines.length && lines[j].trim() === '') {
        emptyLinesCount++;
        j++;
      }
      
      // Check if the next non-empty line is a nested list item
      if (j < lines.length) {
        const nextLine = lines[j];
        const nextListItemMatch = nextLine.match(/^(\s*)([-*]|\d+\.)\s+(.+)$/);
        const nextTaskItemMatch = nextLine.match(/^(\s*)- \[([ x])\]\s+(.+)$/);
        const nextMatch = nextListItemMatch || nextTaskItemMatch;
        
        if (nextMatch) {
          const nextIndentLevel = nextMatch[1].length;
          
          // If next item has more indentation OR same indentation but we skipped empty lines, it might be nested
          // Actually, if we skipped empty lines and next item has same/less indent, it's probably a sibling
          // Only treat as nested if it has more indent
          if (nextIndentLevel > indentLevel) {
            // This is a nested item - remove empty lines and fix indentation
            // Use 3 spaces for ol/ul items, 2 spaces for task items
            const isTaskItem = taskItemMatch !== null;
            const indentIncrement = isTaskItem ? 2 : 3;
            const expectedNestedIndent = indentLevel + indentIncrement;
            const fixedNextLine = nextLine.replace(/^(\s*)/, ' '.repeat(expectedNestedIndent));
            
            result.push(line);
            result.push(fixedNextLine);
            i = j + 1;
            
            // Continue processing nested items
            let k = j + 1;
            while (k < lines.length) {
              const nestedLine = lines[k];
              const nestedListItemMatch = nestedLine.match(/^(\s*)([-*]|\d+\.)\s+(.+)$/);
              const nestedTaskItemMatch = nestedLine.match(/^(\s*)- \[([ x])\]\s+(.+)$/);
              const nestedMatch = nestedListItemMatch || nestedTaskItemMatch;
              
              if (nestedMatch) {
                const nestedIndentLevel = nestedMatch[1].length;
                if (nestedIndentLevel > indentLevel) {
                  // Still nested - fix indentation (use same increment as parent)
                  const fixedNestedLine = nestedLine.replace(/^(\s*)/, ' '.repeat(expectedNestedIndent));
                  result.push(fixedNestedLine);
                  k++;
                } else {
                  // Back to same level or higher - stop
                  break;
                }
              } else if (nestedLine.trim() === '') {
                // Empty line - check if next item is still nested
                let m = k + 1;
                while (m < lines.length && lines[m].trim() === '') {
                  m++;
                }
                if (m < lines.length) {
                  const afterEmptyListItemMatch = lines[m].match(/^(\s*)([-*]|\d+\.)\s+(.+)$/);
                  const afterEmptyTaskItemMatch = lines[m].match(/^(\s*)- \[([ x])\]\s+(.+)$/);
                  const afterEmptyMatch = afterEmptyListItemMatch || afterEmptyTaskItemMatch;
                  if (afterEmptyMatch && afterEmptyMatch[1].length > indentLevel) {
                    // Still nested, skip empty line
                    k = m;
                  } else {
                    break;
                  }
                } else {
                  break;
                }
              } else {
                // Not a list item - stop
                break;
              }
            }
            i = k;
            continue;
          }
        }
      }
      
      // No nested items found (or they're at same level), just add the line
      result.push(line);
      i++;
    } else {
      // Not a list item, just add it
      result.push(line);
      i++;
    }
  }
  
  return result.join('\n');
}

// Add custom rule for regular list items to prevent extra blank lines and preserve indentation
turndownService.addRule('listItem', {
  filter: (node) => {
    // Only match regular list items (not task items)
    return node.nodeName === 'LI' && 
           !(node as HTMLElement).getAttribute('data-type') &&
           node.parentNode &&
           ((node.parentNode as HTMLElement).nodeName === 'UL' || (node.parentNode as HTMLElement).nodeName === 'OL') &&
           (node.parentNode as HTMLElement).getAttribute('data-type') !== 'taskList';
  },
  replacement: (content, node) => {
    // Calculate nesting level and add appropriate indentation (3 spaces per level for ol/ul)
    const level = getNestingLevel(node);
    const indent = '   '.repeat(level);
    
    // Check if this list item contains a nested list
    const hasNestedList = (node as HTMLElement).querySelector('ul, ol');
    
    // Determine if parent is ordered or unordered list
    const parent = node.parentNode as HTMLElement;
    const isOrdered = parent && parent.nodeName === 'OL';
    
    if (hasNestedList) {
      // If there's a nested list, process the content carefully
      // Split by newlines and indent nested list items
      const lines = content.split('\n');
      const processedLines: string[] = [];
      let inNestedList = false;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        
        // Check if this line is a list item (nested)
        const isListItem = /^\s*([-*]|\d+\.)\s+/.test(trimmed);
        
        if (isListItem && !inNestedList) {
          // Start of nested list - add proper indentation (3 spaces)
          inNestedList = true;
          const nestedIndent = indent + '   ';
          processedLines.push(nestedIndent + trimmed);
        } else if (isListItem && inNestedList) {
          // Continue nested list - add proper indentation (3 spaces)
          const nestedIndent = indent + '   ';
          processedLines.push(nestedIndent + trimmed);
        } else if (trimmed === '' && inNestedList) {
          // Empty line in nested list - skip it to avoid extra spacing
          continue;
        } else {
          // Not a list item - this is the main content
          if (inNestedList) {
            inNestedList = false;
          }
          if (i === 0) {
            // First line is the main content
            processedLines.push(trimmed);
          } else if (trimmed) {
            // Additional content lines
            processedLines.push(trimmed);
          }
        }
      }
      
      const processedContent = processedLines.filter(l => l.trim() || l === '').join('\n').trim();
      
      if (isOrdered) {
        const index = Array.from(parent.children).indexOf(node as HTMLElement);
        return `${indent}${index + 1}. ${processedContent}\n`;
      } else {
        return `${indent}- ${processedContent}\n`;
      }
    } else {
      // No nested list, just process normally
      const text = content.trim();
      if (isOrdered) {
        const index = Array.from(parent.children).indexOf(node as HTMLElement);
        return `${indent}${index + 1}. ${text}\n`;
      } else {
        return `${indent}- ${text}\n`;
      }
    }
  },
});

// Add custom rule for regular bullet lists to prevent extra blank lines
turndownService.addRule('bulletList', {
  filter: (node) => {
    return node.nodeName === 'UL' && (node as HTMLElement).getAttribute('data-type') !== 'taskList';
  },
  replacement: (content, node) => {
    // Check if this is a nested list (inside an LI)
    const isNested = (node as HTMLElement).parentNode?.nodeName === 'LI';
    const trimmed = content.trim();
    if (!trimmed) return '';
    
    // For nested lists, don't add extra newlines - they're already part of the parent list item
    if (isNested) {
      return trimmed;
    }
    // For top-level lists, add newlines
    return `\n${trimmed}\n`;
  },
});

// Add custom rule for ordered lists to prevent extra blank lines
turndownService.addRule('orderedList', {
  filter: (node) => {
    return node.nodeName === 'OL';
  },
  replacement: (content, node) => {
    // Check if this is a nested list (inside an LI)
    const isNested = (node as HTMLElement).parentNode?.nodeName === 'LI';
    const trimmed = content.trim();
    if (!trimmed) return '';
    
    // For nested lists, don't add extra newlines - they're already part of the parent list item
    if (isNested) {
      return trimmed;
    }
    // For top-level lists, add newlines
    return `\n${trimmed}\n`;
  },
});

// Note: We handle alerts manually in htmlToMarkdown by extracting them before Turndown processes the HTML.
// Turndown rules for alerts are disabled to avoid conflicts with our manual extraction/restoration process.

// Note: We handle footnotes manually in htmlToMarkdown by extracting them before Turndown processes the HTML.
// Turndown rules for footnotes are disabled to avoid conflicts with our manual extraction/restoration process.

// Add custom rule for horizontal rule
turndownService.addRule('horizontalRule', {
  filter: (node) => {
    return node.nodeName === 'HR';
  },
  replacement: () => {
    return '\n\n---\n\n';
  },
});

// Parse nested lists from markdown
function parseNestedLists(markdown: string): string {
  const lines = markdown.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    
    // Check if this line is a list item
    const taskMatch = line.match(/^(\s*)- \[([ x])\] (.+)$/);
    const orderedMatch = line.match(/^(\s*)(\d+)\. (.+)$/);
    const unorderedMatch = line.match(/^(\s*)- (.+)$/);
    
    if (taskMatch || orderedMatch || unorderedMatch) {
      // Found a list - parse the entire list block
      const listHtml = parseListBlock(lines, i);
      result.push(listHtml.html);
      i = listHtml.nextIndex;
    } else {
      // Not a list item, keep as is
      result.push(line);
      i++;
    }
  }

  return result.join('\n');
}

// Parse a list block starting at the given line index
function parseListBlock(lines: string[], startIndex: number): { html: string; nextIndex: number } {
  interface ListItem {
    type: 'task' | 'ordered' | 'unordered';
    indent: number;
    content: string;
    checked?: boolean;
    children: ListItem[];
  }

  const items: ListItem[] = [];
  let i = startIndex;

  while (i < lines.length) {
    const line = lines[i];
    const indent = line.match(/^(\s*)/)?.[1].length || 0;
    
    // Check if this line is a list item
    const taskMatch = line.match(/^(\s*)- \[([ x])\] (.+)$/);
    const orderedMatch = line.match(/^(\s*)(\d+)\. (.+)$/);
    const unorderedMatch = line.match(/^(\s*)- (.+)$/);
    
    if (taskMatch) {
      items.push({
        type: 'task',
        indent,
        content: taskMatch[3],
        checked: taskMatch[2] === 'x',
        children: [],
      });
      i++;
    } else if (orderedMatch) {
      items.push({
        type: 'ordered',
        indent,
        content: orderedMatch[3],
        children: [],
      });
      i++;
    } else if (unorderedMatch) {
      items.push({
        type: 'unordered',
        indent,
        content: unorderedMatch[2],
        children: [],
      });
      i++;
    } else if (line.trim() === '') {
      // Empty line - might be end of list or just spacing
      i++;
      // If next line is not indented more than current items, end the list
      if (i < lines.length) {
        const nextLine = lines[i];
        const nextIndent = nextLine.match(/^(\s*)/)?.[1].length || 0;
        const minIndent = Math.min(...items.map(item => item.indent));
        if (nextIndent <= minIndent && !nextLine.match(/^(\s*)(-|(\d+)\.)/)) {
          break;
        }
      }
    } else {
      // Not a list item and not empty - end of list
      break;
    }
  }

  // Build nested structure
  function buildNested(items: ListItem[], baseIndent: number = -1): ListItem[] {
    if (items.length === 0) return [];
    
    const result: ListItem[] = [];
    let j = 0;
    
    while (j < items.length) {
      const item = items[j];
      
      // Skip items that are at or below base indent (they belong to a parent level)
      if (baseIndent >= 0 && item.indent <= baseIndent) {
        break;
      }
      
      // This item is at the current level (indent > baseIndent)
      result.push(item);
      j++;
      
      // Collect children (items with greater indent than this item)
      const children: ListItem[] = [];
      while (j < items.length && items[j].indent > item.indent) {
        children.push(items[j]);
        j++;
      }
      
      // Recursively process children
      if (children.length > 0) {
        item.children = buildNested(children, item.indent);
      }
    }
    
    return result;
  }

  const nestedItems = buildNested(items);

  // Convert to HTML
  function itemsToHtml(items: ListItem[]): string {
    if (items.length === 0) return '';
    
    // Determine list type from first item
    const firstType = items[0].type;
    const isTaskList = firstType === 'task';
    const isOrdered = firstType === 'ordered';
    
    let html = '';
    let currentListType: 'task' | 'ordered' | 'unordered' | null = null;
    let listHtml = '';
    
    for (const item of items) {
      // Start new list if type changed
      if (currentListType !== item.type) {
        if (currentListType !== null) {
          // Close previous list
          if (currentListType === 'task') {
            listHtml += '</ul>';
          } else if (currentListType === 'ordered') {
            listHtml += '</ol>';
          } else {
            listHtml += '</ul>';
          }
          html += listHtml;
          listHtml = '';
        }
        
        // Start new list
        if (item.type === 'task') {
          listHtml = '<ul data-type="taskList">';
        } else if (item.type === 'ordered') {
          listHtml = '<ol>';
        } else {
          listHtml = '<ul>';
        }
        currentListType = item.type;
      }
      
      // Add list item
      if (item.type === 'task') {
        const checkedAttr = item.checked ? 'checked' : '';
        const checkedData = item.checked ? 'true' : 'false';
        listHtml += `<li data-type="taskItem" data-checked="${checkedData}"><label><input type="checkbox" ${checkedAttr}></label><div>${item.content}</div>`;
      } else {
        listHtml += `<li>${item.content}`;
      }
      
      // Add children if any
      if (item.children.length > 0) {
        listHtml += itemsToHtml(item.children);
      }
      
      listHtml += '</li>';
    }
    
    // Close last list
    if (currentListType === 'task') {
      listHtml += '</ul>';
    } else if (currentListType === 'ordered') {
      listHtml += '</ol>';
    } else {
      listHtml += '</ul>';
    }
    html += listHtml;
    
    return html;
  }

  return {
    html: itemsToHtml(nestedItems),
    nextIndex: i,
  };
}

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
    .replace(/`([^`]+)`/g, '<code>$1</code>');

  // Parse nested lists (must be done before paragraph processing)
  html = parseNestedLists(html);

  html = html
    // Footnote definitions MUST come before footnote references
    // Otherwise [^1]: content will be matched by the reference regex first
    .replace(/\[\^(\d+)\]: (.+)$/gm, (match, id, content) => {
      const html = `<div data-footnote-id="${id}" class="footnote-definition"><p>${content}</p></div>`;
      console.log('Converting footnote definition:', match, 'to HTML:', html);
      return html;
    })
    // Footnotes references (after definitions to avoid conflicts)
    .replace(/\[\^(\d+)\]/g, (match, id) => {
      const html = `<sup data-footnote-ref="${id}" class="footnote-reference">${id}</sup>`;
      console.log('Converting footnote reference:', match, 'to HTML:', html);
      return html;
    })
    // Horizontal rule
    .replace(/^---$/gm, '<hr>')
    // Alerts (blockquotes with [!TYPE])
    .replace(/^> \[!(\w+)\]\s*$/gm, (_, type) => {
      // This will be handled in the blockquote processing
      return `> [!${type}]`;
    });
  
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
  
  // Process alerts (blockquotes with [!TYPE])
  // This needs to be done line by line to properly handle multi-line alerts
  const lines = html.split('\n');
  const processedLines: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Check if this line starts an alert blockquote
    const alertMatch = line.match(/^> \[!(\w+)\]\s*$/);
    if (alertMatch) {
      const type = alertMatch[1].toLowerCase();
      const alertContent: string[] = [];
      i++; // Skip the alert type line
      // Skip empty line after alert type
      if (i < lines.length && lines[i].trim().match(/^>\s*$/)) {
        i++;
      }
      // Collect all following lines that start with >
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        const content = lines[i].replace(/^>\s?/, '');
        if (content.trim() !== '') {
          alertContent.push(content);
        }
        i++;
        // Stop if we hit a blank line (end of alert block)
        if (i < lines.length && lines[i].trim() === '') {
          break;
        }
      }
      if (alertContent.length > 0) {
        processedLines.push(`<div data-alert-type="${type}"><p>${alertContent.join('</p><p>')}</p></div>`);
      }
      continue;
    }
    processedLines.push(line);
    i++;
  }
  html = processedLines.join('\n');

  html = html
    // Blockquotes (regular, not alerts - alerts are already processed above)
    .replace(/^> (.+)$/gm, (match, content) => {
      // Skip if this is part of an alert (already processed)
      if (match.includes('[!')) {
        return match;
      }
      return `<blockquote>${content}</blockquote>`;
    })
    // Paragraphs - split by double newlines
    .split('\n\n')
    .map(para => {
      // Skip already processed block elements and images
      if (para.match(/^<(h\d|ul|ol|pre|table|img|div|blockquote|hr)/)) {
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
      // Skip if this contains list items (already processed)
      if (para.includes('<li')) {
        return para;
      }
      // Handle line breaks within paragraphs (two spaces + newline in markdown)
      const processedPara = para
        .replace(/  \n/g, '<br>')  // Two spaces + newline = <br>
        .replace(/\n/g, '<br>');   // Single newlines also become <br> within a paragraph
      return `<p>${processedPara}</p>`;
    })
    .filter(para => para !== '')  // Remove empty strings
    .join('\n\n')  // Join with double newlines to separate paragraphs
    // Clean up empty list items that might have been created
    .replace(/<li[^>]*>\s*<\/li>/g, '')
    .replace(/<li[^>]*><p>\s*<\/p><\/li>/g, '')
    .replace(/<li[^>]*><p><br[^>]*><\/p><\/li>/gi, '')
    .replace(/<li[^>]*><p><br[^>]*class="[^"]*ProseMirror-trailingBreak[^"]*"[^>]*><\/p><\/li>/gi, '')
    .replace(/<li[^>]*><p><br[^>]*><br[^>]*class="[^"]*ProseMirror-trailingBreak[^"]*"[^>]*><\/p><\/li>/gi, '');

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
    console.log('Starting HTML to Markdown conversion...');
    console.log('Input HTML length:', html.length);
    console.log('Input HTML (first 2000 chars):', html.substring(0, 2000));
    
    // Check if footnote definitions are present
    const hasFootnoteDefs = /<div[^>]*data-footnote-id/gi.test(html);
    console.log('Has footnote definitions in HTML:', hasFootnoteDefs);
    if (hasFootnoteDefs) {
      const defMatches = html.match(/<div[^>]*data-footnote-id[^>]*>[\s\S]*?<\/div>/gi);
      console.log('Found footnote definition matches:', defMatches?.length || 0);
      if (defMatches) {
        console.log('Sample footnote definitions:', defMatches.slice(0, 3));
      }
    }
    
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
    
    // Preserve alerts before processing (extract and restore like footnotes)
    const alerts: Array<{ placeholder: string; replacement: string; index: number; length: number }> = [];
    
    // Preserve footnote references and definitions before processing
    const footnoteRefs: Array<{ placeholder: string; replacement: string; index: number; length: number }> = [];
    const footnoteDefs: Array<{ placeholder: string; replacement: string; index: number; length: number }> = [];
    
    // Extract footnote references - find all matches first, then replace in reverse order
    // Use a more flexible approach that doesn't depend on attribute order
    const refMatches: Array<{ fullMatch: string; id: string; index: number }> = [];
    
    // Match any sup tag that has data-footnote-ref attribute (regardless of attribute order)
    const refRegex = /<sup([^>]*)>([^<]*)<\/sup>/gi;
    let refMatch;
    while ((refMatch = refRegex.exec(processedHtml)) !== null) {
      const attrs = refMatch[1];
      const content = refMatch[2];
      
      // Check if this sup tag has the data-footnote-ref attribute (handle both single and double quotes)
      let idMatch = attrs.match(/data-footnote-ref="([^"]*)"/);
      if (!idMatch) {
        idMatch = attrs.match(/data-footnote-ref='([^']*)'/);
      }
      if (idMatch) {
        let id = idMatch[1];
        // If ID is empty but content exists, use content as ID (fallback)
        if (!id && content) {
          id = content.trim();
        }
        // Only process if we have a valid ID (not empty)
        if (id) {
          refMatches.push({
            fullMatch: refMatch[0],
            id: id,
            index: refMatch.index,
          });
        } else {
          // Log warning if we found a footnote reference with empty ID
          console.warn('Found footnote reference with empty ID:', refMatch[0]);
        }
      }
    }
    
    // Debug: log what we found
    if (refMatches.length > 0) {
      console.log('Found footnote references:', refMatches.map(m => ({ id: m.id, html: m.fullMatch.substring(0, 100) })));
    } else {
      // Try to find any sup tags to debug
      const allSupTags = processedHtml.match(/<sup[^>]*>.*?<\/sup>/gi);
      if (allSupTags && allSupTags.length > 0) {
        console.log('Found sup tags but no footnote refs:', allSupTags.slice(0, 5));
      }
    }
    
    // Sort by index descending for reverse replacement
    refMatches.sort((a, b) => b.index - a.index);
    
    // Replace references in reverse order using substring manipulation
    for (const { fullMatch, id, index } of refMatches) {
      const placeholder = `__FOOTNOTE_REF_${footnoteRefs.length}__`;
      footnoteRefs.push({ 
        placeholder, 
        replacement: `[^${id}]`,
        index,
        length: fullMatch.length
      });
      // Replace at specific index
      processedHtml = processedHtml.substring(0, index) + placeholder + processedHtml.substring(index + fullMatch.length);
    }
    
    // Extract footnote definitions - find all matches first, then replace in reverse order
    // Use a more flexible approach that doesn't depend on attribute order
    const defMatches: Array<{ fullMatch: string; id: string; content: string; index: number }> = [];
    
    // Match any div tag that has data-footnote-id attribute (regardless of attribute order)
    const defRegex = /<div([^>]*)>([\s\S]*?)<\/div>/gi;
    let defMatch: RegExpExecArray | null;
    while ((defMatch = defRegex.exec(processedHtml)) !== null) {
      const attrs = defMatch[1];
      const content = defMatch[2];
      
      // Check if this div tag has the data-footnote-id attribute (handle both single and double quotes)
      let idMatch = attrs.match(/data-footnote-id="([^"]*)"/);
      if (!idMatch) {
        idMatch = attrs.match(/data-footnote-id='([^']*)'/);
      }
      if (idMatch) {
        const id = idMatch[1];
        // Only process if we have a valid ID (not empty)
        if (id) {
          // Check if this is already matched (avoid duplicates)
          const alreadyMatched = defMatches.some(m => m.index === defMatch.index);
          if (!alreadyMatched) {
            defMatches.push({
              fullMatch: defMatch[0],
              id: id,
              content: content,
              index: defMatch.index,
            });
          }
        }
      }
    }
    
    // Sort by index descending for reverse replacement
    defMatches.sort((a, b) => b.index - a.index);
    
    // Replace definitions in reverse order using substring manipulation
    for (const { fullMatch, id, content, index } of defMatches) {
      const placeholder = `__FOOTNOTE_DEF_${footnoteDefs.length}__`;
      // Extract text content from HTML, preserving structure
      let text = content;
      // Remove HTML tags but preserve text
      text = text.replace(/<p[^>]*>/g, '').replace(/<\/p>/g, ' ').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '');
      text = text.trim().replace(/\n+/g, ' ').replace(/\s+/g, ' ');
      if (text || id) {
        // Include even if text is empty, as long as we have an ID
        footnoteDefs.push({ 
          placeholder, 
          replacement: `\n[^${id}]: ${text || ''}\n`,
          index,
          length: fullMatch.length
        });
        // Replace at specific index
        processedHtml = processedHtml.substring(0, index) + placeholder + processedHtml.substring(index + fullMatch.length);
      }
    }
    
    // Extract alerts - find all divs with data-alert-type attribute
    // We need to properly handle nested divs by finding the matching closing tag
    const alertMatches: Array<{ fullMatch: string; type: string; content: string; index: number }> = [];
    
    // Find all opening div tags with data-alert-type
    const alertOpenRegex = /<div([^>]*data-alert-type="([^"]*)"[^>]*)>/gi;
    let alertOpenMatch: RegExpExecArray | null;
    const openTags: Array<{ index: number; type: string; openTag: string }> = [];
    
    while ((alertOpenMatch = alertOpenRegex.exec(processedHtml)) !== null) {
      const type = alertOpenMatch[2];
      if (type) {
        openTags.push({
          index: alertOpenMatch.index,
          type: type,
          openTag: alertOpenMatch[0],
        });
      }
    }
    
    // For each opening tag, find the matching closing tag by counting div nesting
    for (const openTag of openTags) {
      let pos = openTag.index + openTag.openTag.length;
      let depth = 1;
      let contentStart = pos;
      
      while (depth > 0 && pos < processedHtml.length) {
        const nextOpen = processedHtml.indexOf('<div', pos);
        const nextClose = processedHtml.indexOf('</div>', pos);
        
        if (nextClose === -1) break; // No closing tag found
        
        if (nextOpen !== -1 && nextOpen < nextClose) {
          depth++;
          pos = nextOpen + 4;
        } else {
          depth--;
          if (depth === 0) {
            // Found matching closing tag
            const content = processedHtml.substring(contentStart, nextClose);
            const fullMatch = processedHtml.substring(openTag.index, nextClose + 6);
            
            // Check if this alert is nested inside another alert we've already found
            const isNested = alertMatches.some(m => 
              m.index < openTag.index && openTag.index < m.index + m.fullMatch.length
            );
            
            if (!isNested) {
              alertMatches.push({
                fullMatch,
                type: openTag.type,
                content,
                index: openTag.index,
              });
            }
            break;
          }
          pos = nextClose + 6;
        }
      }
    }
    
    // Sort by index descending for reverse replacement
    alertMatches.sort((a, b) => b.index - a.index);
    
    // Replace alerts in reverse order using substring manipulation
    for (const { fullMatch, type, content, index } of alertMatches) {
      const placeholder = `__ALERT_${alerts.length}__`;
      
      // Extract text content from HTML, preserving line breaks
      let text = content;
      // Remove alert-header and alert-content wrapper divs, but keep their content
      text = text.replace(/<div[^>]*class="alert-header"[^>]*>[\s\S]*?<\/div>/gi, '');
      text = text.replace(/<div[^>]*class="alert-content"[^>]*>/gi, '');
      text = text.replace(/<\/div>/g, '');
      // Extract text from paragraphs and other elements
      text = text.replace(/<p[^>]*>/g, '').replace(/<\/p>/g, '\n').replace(/<br\s*\/?>/gi, '\n');
      text = text.replace(/<[^>]*>/g, ''); // Remove remaining HTML tags
      text = text.trim().replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '');
      
      // Split into lines and format as markdown alert
      const lines = text.split('\n').filter(line => line.trim());
      const typeUpper = type.toUpperCase();
      const quotedLines = lines.map(line => `> ${line}`).join('\n');
      const markdown = `> [!${typeUpper}]\n>\n${quotedLines}\n\n`;
      
      alerts.push({
        placeholder,
        replacement: markdown,
        index,
        length: fullMatch.length
      });
      
      // Replace at specific index
      processedHtml = processedHtml.substring(0, index) + placeholder + processedHtml.substring(index + fullMatch.length);
    }
    
    // Debug logging
    if (footnoteRefs.length > 0 || footnoteDefs.length > 0) {
      console.log('Extracted footnotes:', {
        refs: footnoteRefs.length,
        defs: footnoteDefs.length,
        refDetails: footnoteRefs.map(r => ({ placeholder: r.placeholder, replacement: r.replacement })),
        defDetails: footnoteDefs.map(d => ({ placeholder: d.placeholder, replacement: d.replacement })),
      });
    }
    
    if (alerts.length > 0) {
      console.log('Extracted alerts:', alerts.map(a => ({ placeholder: a.placeholder, replacement: a.replacement.substring(0, 50) })));
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
    
    let markdown = turndownService.turndown(cleanedHtml);
    
    // Post-process to fix nested list indentation
    markdown = fixNestedListIndentation(markdown);
    
    // Restore footnote references (in reverse order to avoid index conflicts)
    for (let i = footnoteRefs.length - 1; i >= 0; i--) {
      const { placeholder, replacement } = footnoteRefs[i];
      const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const beforeReplace = markdown;
      markdown = markdown.replace(new RegExp(escapedPlaceholder, 'g'), replacement);
      if (beforeReplace !== markdown) {
        console.log(`Restored footnote reference: ${placeholder} -> ${replacement}`);
      } else {
        console.warn(`Failed to restore footnote reference placeholder: ${placeholder}`);
      }
    }
    
    // Restore footnote definitions (in reverse order to avoid index conflicts)
    for (let i = footnoteDefs.length - 1; i >= 0; i--) {
      const { placeholder, replacement } = footnoteDefs[i];
      const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const beforeReplace = markdown;
      markdown = markdown.replace(new RegExp(escapedPlaceholder, 'g'), replacement);
      if (beforeReplace !== markdown) {
        console.log(`Restored footnote definition: ${placeholder} -> ${replacement}`);
      } else {
        console.warn(`Failed to restore footnote definition placeholder: ${placeholder}`);
      }
    }
    
    // Restore alerts (in reverse order to avoid index conflicts)
    for (let i = alerts.length - 1; i >= 0; i--) {
      const { placeholder, replacement } = alerts[i];
      const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const beforeReplace = markdown;
      markdown = markdown.replace(new RegExp(escapedPlaceholder, 'g'), replacement);
      if (beforeReplace !== markdown) {
        console.log(`Restored alert: ${placeholder} -> ${replacement.substring(0, 50)}...`);
      } else {
        console.warn(`Failed to restore alert placeholder: ${placeholder}`);
      }
    }
    
    // Clean up excessive whitespace while preserving paragraph breaks
    const finalMarkdown = markdown
      .replace(/\n{4,}/g, '\n\n') // More than 3 newlines to double newlines
      .replace(/[ \t]+$/gm, '') // Remove trailing spaces from lines
      .trim();
    
    console.log('Conversion complete. Output length:', finalMarkdown.length);
    console.log('First 500 chars of markdown:', finalMarkdown.substring(0, 500));
    
    // Validate that we actually got markdown, not HTML
    if (finalMarkdown.includes('<html') || finalMarkdown.includes('<!DOCTYPE') || 
        (finalMarkdown.includes('<p>') && !finalMarkdown.includes('[^'))) {
      console.error('Conversion appears to have failed - output looks like HTML');
      console.error('Output:', finalMarkdown.substring(0, 1000));
      throw new Error('HTML to Markdown conversion failed - output is still HTML');
    }
    
    return finalMarkdown;
  } catch (error) {
    console.error('Error converting HTML to Markdown:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('HTML content (first 2000 chars):', html.substring(0, 2000));
    // Don't return HTML - throw the error so the save fails rather than saving HTML
    throw error;
  }
}

export async function loadFileFromPath(filePath: string): Promise<{ path: string; content: string } | null> {
  try {
    const markdownContent = await readTextFile(filePath);
    // Convert Markdown to HTML for the editor
    const htmlContent = await markdownToHTML(markdownContent, filePath);
    
    return { path: filePath, content: htmlContent };
  } catch (error) {
    console.error('Error loading file from path:', error);
    throw error;
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

    return loadFileFromPath(filePath);
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
