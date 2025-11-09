import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import { useRef } from 'react';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { Editor } from '@tiptap/react';
import { useBorderDetection } from '../hooks/useBorderDetection';
import { useNodeViewSelection } from '../hooks/useNodeViewSelection';
import { useNodeViewCopy } from '../hooks/useNodeViewCopy';
import { LanguageSelector } from './LanguageSelector';

interface CodeBlockComponentProps {
  node: ProseMirrorNode;
  editor: Editor;
  getPos: () => number | undefined;
  updateAttributes: (attributes: Record<string, string>) => void;
}

export const CodeBlockComponent = ({ 
  node, 
  editor, 
  getPos, 
  updateAttributes 
}: CodeBlockComponentProps) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLPreElement>(null);
  const currentLanguage = node.attrs.language || 'auto';

  const { isHoveringBorder, checkBorderHover } = useBorderDetection(wrapperRef);
  
  const { isSelected } = useNodeViewSelection({
    editor,
    node,
    getPos,
    wrapperRef,
    checkBorderHover,
    nodeType: 'codeBlock',
  });

  const handleLanguageChange = (language: string) => {
    updateAttributes({ language });
  };

  const getCopyData = (node: ProseMirrorNode) => {
    const codeContent = node.textContent || '';
    const language = node.attrs.language || '';
    
    // Escape HTML entities in code content
    const escapeHTML = (str: string) => {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    };
    
    // Create HTML representation
    const codeHTML = language
      ? `<pre><code class="language-${language}">${escapeHTML(codeContent)}</code></pre>`
      : `<pre><code>${escapeHTML(codeContent)}</code></pre>`;
    
    // Also get markdown for pasting elsewhere
    const markdown = language 
      ? `\`\`\`${language}\n${codeContent}\n\`\`\``
      : `\`\`\`\n${codeContent}\n\`\`\``;
    
    return { html: codeHTML, markdown };
  };

  useNodeViewCopy({
    isSelected,
    editor,
    node,
    getPos,
    wrapperRef,
    nodeType: 'codeBlock',
    getCopyData,
  });

  return (
    <NodeViewWrapper
      ref={wrapperRef}
      className="code-block-wrapper relative"
      data-selected={isSelected}
      data-hovering-border={isHoveringBorder}
    >
      <LanguageSelector 
        currentLanguage={currentLanguage}
        onLanguageChange={handleLanguageChange}
      />
      <div className="code-block-content-wrapper">
        <pre ref={contentRef}>
          <NodeViewContent />
        </pre>
      </div>
    </NodeViewWrapper>
  );
};
