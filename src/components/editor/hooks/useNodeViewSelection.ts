import { useState, useEffect } from 'react';
import type { Editor } from '@tiptap/react';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

interface UseNodeViewSelectionProps {
  editor: Editor;
  node: ProseMirrorNode;
  getPos: () => number | undefined;
  wrapperRef: React.RefObject<HTMLDivElement>;
  checkBorderHover: (e: MouseEvent) => boolean;
  nodeType: string;
}

export function useNodeViewSelection({
  editor,
  node,
  getPos,
  wrapperRef,
  checkBorderHover,
  nodeType,
}: UseNodeViewSelectionProps) {
  const [isSelected, setIsSelected] = useState(false);

  // Handle click to select node
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const handleClick = (e: MouseEvent) => {
      // Only select if clicking on border area
      if (checkBorderHover(e)) {
        e.preventDefault();
        e.stopPropagation();
        
        const pos = getPos();
        if (pos !== undefined) {
          // Select the entire node
          editor.commands.setNodeSelection(pos);
          setIsSelected(true);
        }
      } else {
        // Allow normal editing inside
        setIsSelected(false);
      }
    };

    wrapper.addEventListener('click', handleClick, true);

    return () => {
      wrapper.removeEventListener('click', handleClick, true);
    };
  }, [editor, getPos, checkBorderHover, wrapperRef]);

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
      try {
        const $anchor = (selection as { $anchor?: { pos?: number } }).$anchor;
        if ($anchor && typeof $anchor.pos === 'number' && $anchor.pos === pos) {
          // Verify it's selecting the correct node type
          const nodeAtPos = state.doc.nodeAt(pos);
          if (nodeAtPos && nodeAtPos.type.name === nodeType) {
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
  }, [editor, getPos, node.nodeSize, nodeType]);

  return { isSelected, setIsSelected };
}
