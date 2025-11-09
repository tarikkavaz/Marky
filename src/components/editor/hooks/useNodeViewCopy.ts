import { useEffect } from 'react';
import type { Editor } from '@tiptap/react';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

interface UseNodeViewCopyProps {
  isSelected: boolean;
  editor: Editor;
  node: ProseMirrorNode;
  getPos: () => number | undefined;
  wrapperRef: React.RefObject<HTMLDivElement>;
  nodeType: string;
  getCopyData: (node: ProseMirrorNode, htmlElement?: HTMLElement) => {
    html: string;
    markdown: string;
    plain?: string;
  };
}

export function useNodeViewCopy({
  isSelected,
  editor,
  node,
  getPos,
  wrapperRef,
  nodeType,
  getCopyData,
}: UseNodeViewCopyProps) {
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

      // Get the node at this position
      const selectedNode = state.doc.nodeAt(pos);
      if (!selectedNode || selectedNode.type.name !== nodeType) return;

      // Get HTML element if available
      const htmlElement = wrapperRef.current?.querySelector('table, pre') as HTMLElement | undefined;

      // Get copy data
      const { html, markdown, plain } = getCopyData(selectedNode, htmlElement);
      
      // Set clipboard data
      e.clipboardData?.setData('text/html', html);
      e.clipboardData?.setData('text/plain', plain || markdown);
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
  }, [isSelected, editor, getPos, node.nodeSize, nodeType, getCopyData, wrapperRef]);
}
