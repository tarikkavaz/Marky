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
    return `- [${isChecked ? 'x' : ' '}] ${text}\n`;
  },
});

// Add custom rule for regular list items to prevent extra blank lines
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
    const text = content.trim();
    // Determine if parent is ordered or unordered list
    const parent = node.parentNode as HTMLElement;
    if (parent && parent.nodeName === 'OL') {
      // For ordered lists, Turndown will handle numbering, we just need to prevent extra blank lines
      // Get the index of this li within its parent
      const index = Array.from(parent.children).indexOf(node as HTMLElement);
      return `${index + 1}. ${text}\n`;
    } else {
      // For unordered lists, use bullet
      return `- ${text}\n`;
    }
  },
});

// Add custom rule for regular bullet lists to prevent extra blank lines
turndownService.addRule('bulletList', {
  filter: (node) => {
    return node.nodeName === 'UL' && (node as HTMLElement).getAttribute('data-type') !== 'taskList';
  },
  replacement: (content) => {
    // Remove trailing newlines and add single newline
    const trimmed = content.trim();
    return trimmed ? `\n${trimmed}\n` : '';
  },
});

// Add custom rule for ordered lists to prevent extra blank lines
turndownService.addRule('orderedList', {
  filter: (node) => {
    return node.nodeName === 'OL';
  },
  replacement: (content) => {
    // Remove trailing newlines and add single newline
    const trimmed = content.trim();
    return trimmed ? `\n${trimmed}\n` : '';
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
    // Task lists (must come before regular lists)
    .replace(/^- \[([ x])\] (.+)$/gm, (_, checked, text) => {
      const isChecked = checked === 'x';
      return `<li data-type="taskItem" data-checked="${isChecked}"><label><input type="checkbox" ${isChecked ? 'checked' : ''}></label><div>${text}</div></li>`;
    })
    // Ordered lists - mark them with a data attribute so we can identify them later
    // Only match non-empty lines (skip empty lines)
    .replace(/^(\d+)\. (.+)$/gm, '<li data-ordered="true">$2</li>')
    // Regular unordered lists - only match non-empty lines
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    // Group consecutive list items into lists
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, (match) => {
      // Check if this is a task list
      if (match.includes('data-type="taskItem"')) {
        return `<ul data-type="taskList">${match}</ul>`;
      }
      // Check if this should be an ordered list (has data-ordered attribute)
      if (match.includes('data-ordered="true"')) {
        // Remove the data-ordered attribute and wrap in <ol>
        const cleanedMatch = match.replace(/ data-ordered="true"/g, '');
        return `<ol>${cleanedMatch}</ol>`;
      }
      // Regular unordered list
      return `<ul>${match}</ul>`;
    })
    // Clean up empty list items and trailing breaks
    .replace(/<li[^>]*>\s*<\/li>/g, '')
    .replace(/<li[^>]*><p>\s*<\/p><\/li>/g, '')
    .replace(/<li[^>]*><p><br[^>]*><\/p><\/li>/g, '')
    .replace(/<li[^>]*><p><br[^>]*class="ProseMirror-trailingBreak"[^>]*><\/p><\/li>/g, '')
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
