import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import { useRef } from 'react';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { Editor } from '@tiptap/react';
import { useBorderDetection } from '../hooks/useBorderDetection';
import { useNodeViewSelection } from '../hooks/useNodeViewSelection';
import { useNodeViewCopy } from '../hooks/useNodeViewCopy';
import { Info, Lightbulb, MessageSquareWarning, AlertTriangle, AlertCircle } from 'lucide-react';

export type AlertType = 'note' | 'tip' | 'important' | 'warning' | 'caution';

interface AlertComponentProps {
  node: ProseMirrorNode;
  editor: Editor;
  getPos: () => number | undefined;
  updateAttributes: (attributes: Record<string, string>) => void;
}

const alertConfig: Record<AlertType, { label: string; icon: typeof Info; color: string }> = {
  note: { label: 'Note', icon: Info, color: 'blue' },
  tip: { label: 'Tip', icon: Lightbulb, color: 'green' },
  important: { label: 'Important', icon: MessageSquareWarning, color: 'purple' },
  warning: { label: 'Warning', icon: AlertTriangle, color: 'orange' },
  caution: { label: 'Caution', icon: AlertCircle, color: 'red' },
};

export const AlertComponent = ({ 
  node, 
  editor, 
  getPos 
}: AlertComponentProps) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const alertType = (node.attrs.type || 'note') as AlertType;
  const config = alertConfig[alertType];
  const Icon = config.icon;

  const { isHoveringBorder, checkBorderHover } = useBorderDetection(wrapperRef);
  
  const { isSelected } = useNodeViewSelection({
    editor,
    node,
    getPos,
    wrapperRef,
    checkBorderHover,
    nodeType: 'alert',
  });

  const getCopyData = (node: ProseMirrorNode) => {
    const content = node.textContent || '';
    const type = node.attrs.type || 'note';
    const typeUpper = type.toUpperCase();
    
    // Create markdown representation
    const markdown = `> [!${typeUpper}]\n>\n> ${content.split('\n').join('\n> ')}`;
    
    // Create HTML representation
    const html = `<div data-alert-type="${type}" class="alert alert-${type}">${node.textContent}</div>`;
    
    return { html, markdown };
  };

  useNodeViewCopy({
    isSelected,
    editor,
    node,
    getPos,
    wrapperRef,
    nodeType: 'alert',
    getCopyData,
  });

  return (
    <NodeViewWrapper
      ref={wrapperRef}
      className={`alert-wrapper alert-${alertType} relative`}
      data-selected={isSelected}
      data-hovering-border={isHoveringBorder}
      data-alert-type={alertType}
    >
      <div className="alert-content">
        <div className="alert-header">
          <Icon className={`alert-icon alert-icon-${config.color}`} />
          <span className={`alert-label alert-label-${config.color}`}>{config.label}</span>
        </div>
        <div className="alert-body">
          <NodeViewContent />
        </div>
      </div>
    </NodeViewWrapper>
  );
};
