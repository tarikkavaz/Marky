import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import { useState, useRef, useEffect } from 'react';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { Editor } from '@tiptap/react';

interface TableComponentProps {
  node: ProseMirrorNode;
  editor: Editor;
  getPos: () => number | undefined;
  updateAttributes: (attributes: Record<string, string>) => void;
}

const BORDER_DETECTION_THRESHOLD = 8; // pixels from edge to detect border hover

export const TableComponent = ({ node, editor, getPos }: TableComponentProps) => {
  const [isHoveringBorder, setIsHoveringBorder] = useState(false);
  const [isSelected, setIsSelected] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Check if mouse is near border
  const checkBorderHover = (e: MouseEvent) => {
    if (!wrapperRef.current) return false;

    const wrapperRect = wrapperRef.current.getBoundingClientRect();
    const mouseX = e.clientX - wrapperRect.left;
    const mouseY = e.clientY - wrapperRect.top;

    const isNearTop = mouseY < BORDER_DETECTION_THRESHOLD;
    const isNearBottom = mouseY > wrapperRect.height - BORDER_DETECTION_THRESHOLD;
    const isNearLeft = mouseX < BORDER_DETECTION_THRESHOLD;
    const isNearRight = mouseX > wrapperRect.width - BORDER_DETECTION_THRESHOLD;

    return isNearTop || isNearBottom || isNearLeft || isNearRight;
  };

  // Attach event listeners directly to DOM
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const handleMouseMove = (e: MouseEvent) => {
      const isOnBorder = checkBorderHover(e);
      setIsHoveringBorder(isOnBorder);
    };

    const handleMouseLeave = () => {
      setIsHoveringBorder(false);
    };

    const handleClick = (e: MouseEvent) => {
      // Only select if clicking on border area
      if (checkBorderHover(e)) {
        e.preventDefault();
        e.stopPropagation();
        
        const pos = getPos();
        if (pos !== undefined) {
          // Select the entire table node
          editor.commands.setNodeSelection(pos);
          setIsSelected(true);
        }
      } else {
        // Allow normal editing inside
        setIsSelected(false);
      }
    };

    wrapper.addEventListener('mousemove', handleMouseMove);
    wrapper.addEventListener('mouseleave', handleMouseLeave);
    wrapper.addEventListener('click', handleClick, true);

    return () => {
      wrapper.removeEventListener('mousemove', handleMouseMove);
      wrapper.removeEventListener('mouseleave', handleMouseLeave);
      wrapper.removeEventListener('click', handleClick, true);
    };
  }, [editor, getPos]);

  // Handle copy when selected
  useEffect(() => {
    if (!isSelected) return;

    const handleCopy = (e: ClipboardEvent) => {
      const { state } = editor;
      const { selection } = state;
      const pos = getPos();
      
      // Check if this node is selected
      if (pos === undefined) return;
      
      // Check if selection covers this node
      const coversNode = selection.from <= pos && selection.to >= pos + node.nodeSize;
      if (!coversNode) {
        // Also check for node selection
        try {
          const $anchor = (selection as { $anchor?: { pos?: number } }).$anchor;
          if ($anchor && typeof $anchor.pos === 'number' && $anchor.pos === pos) {
            // This is a node selection at our position
          } else {
            return;
          }
        } catch {
          return;
        }
      }

      // Get the HTML representation for TipTap to paste as rendered content
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      
      const tableElement = wrapper.querySelector('table') as HTMLTableElement;
      if (!tableElement) return;

      // Get the HTML of the table - TipTap will parse this
      const tableHTML = tableElement.outerHTML;
      
      // Also get markdown for pasting elsewhere
      const markdown = tableToMarkdown(tableElement);
      
      // Set HTML first so TipTap can paste it as rendered content
      e.clipboardData?.setData('text/html', tableHTML);
      e.clipboardData?.setData('text/plain', markdown);
      e.clipboardData?.setData('text/markdown', markdown);
      e.preventDefault();
      e.stopPropagation();
    };

    const wrapper = wrapperRef.current;
    if (wrapper) {
      wrapper.addEventListener('copy', handleCopy, true);
      return () => {
        wrapper.removeEventListener('copy', handleCopy, true);
      };
    }
  }, [isSelected, editor, getPos, node.nodeSize]);

  // Check if node is selected via editor selection
  useEffect(() => {
    const updateSelection = () => {
      const { state } = editor;
      const { selection } = state;
      const pos = getPos();
      
      if (pos === undefined) {
        setIsSelected(false);
        return;
      }

      // Check if this is a node selection at our position
      // NodeSelection has $anchor.pos equal to the node position
      try {
        const $anchor = (selection as { $anchor?: { pos?: number } }).$anchor;
        if ($anchor && typeof $anchor.pos === 'number' && $anchor.pos === pos) {
          // Verify it's selecting a table node
          const nodeAtPos = state.doc.nodeAt(pos);
          if (nodeAtPos && nodeAtPos.type.name === 'table') {
            setIsSelected(true);
            return;
          }
        }
      } catch {
        // Not a node selection, continue to check range
      }

      // Check if range selection covers this node
      if (selection.from <= pos && selection.to >= pos + node.nodeSize) {
        setIsSelected(true);
      } else {
        setIsSelected(false);
      }
    };

    editor.on('selectionUpdate', updateSelection);
    updateSelection(); // Initial check
    return () => {
      editor.off('selectionUpdate', updateSelection);
    };
  }, [editor, getPos, node.nodeSize]);


  return (
    <NodeViewWrapper
      ref={wrapperRef}
      className="table-wrapper relative"
      data-selected={isSelected}
      data-hovering-border={isHoveringBorder}
    >
      <div className="table-content-wrapper">
        <NodeViewContent />
      </div>
    </NodeViewWrapper>
  );
};

// Simple table to markdown converter
function tableToMarkdown(table: HTMLTableElement): string {
  const rows: string[] = [];
  const cells: string[][] = [];

  // Extract all rows
  table.querySelectorAll('tr').forEach((row) => {
    const rowCells: string[] = [];
    row.querySelectorAll('td, th').forEach((cell) => {
      rowCells.push(cell.textContent?.trim() || '');
    });
    if (rowCells.length > 0) {
      cells.push(rowCells);
    }
  });

  if (cells.length === 0) return '';

  // Build markdown table
  cells.forEach((row, index) => {
    rows.push('| ' + row.join(' | ') + ' |');
    
    // Add separator after header row
    if (index === 0) {
      rows.push('| ' + row.map(() => '---').join(' | ') + ' |');
    }
  });

  return rows.join('\n');
}
