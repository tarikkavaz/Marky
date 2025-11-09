import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import { useRef } from 'react';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { Editor } from '@tiptap/react';
import { useBorderDetection } from '../hooks/useBorderDetection';
import { useNodeViewSelection } from '../hooks/useNodeViewSelection';
import { useNodeViewCopy } from '../hooks/useNodeViewCopy';
import { tableToMarkdown } from './utils';

interface TableComponentProps {
  node: ProseMirrorNode;
  editor: Editor;
  getPos: () => number | undefined;
  updateAttributes: (attributes: Record<string, string>) => void;
}

export const TableComponent = ({ 
  node, 
  editor, 
  getPos 
}: TableComponentProps) => {
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { isHoveringBorder, checkBorderHover } = useBorderDetection(wrapperRef);
  
  const { isSelected } = useNodeViewSelection({
    editor,
    node,
    getPos,
    wrapperRef,
    checkBorderHover,
    nodeType: 'table',
  });

  const getCopyData = (node: ProseMirrorNode, htmlElement?: HTMLElement) => {
    const tableElement = htmlElement as HTMLTableElement;
    if (!tableElement) {
      return { html: '', markdown: '' };
    }

    // Get the HTML of the table - TipTap will parse this
    const tableHTML = tableElement.outerHTML;
    
    // Also get markdown for pasting elsewhere
    const markdown = tableToMarkdown(tableElement);
    
    return { html: tableHTML, markdown };
  };

  useNodeViewCopy({
    isSelected,
    editor,
    node,
    getPos,
    wrapperRef,
    nodeType: 'table',
    getCopyData,
  });

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
