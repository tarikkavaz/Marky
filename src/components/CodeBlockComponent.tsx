import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import { useState, useEffect, useRef } from 'react';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

interface CodeBlockComponentProps {
  node: ProseMirrorNode;
  updateAttributes: (attributes: Record<string, string>) => void;
}

const LANGUAGES = [
  { value: 'auto', label: 'Auto' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'css', label: 'CSS' },
  { value: 'html', label: 'HTML' },
  { value: 'json', label: 'JSON' },
  { value: 'bash', label: 'Bash' },
  { value: 'shell', label: 'Shell' },
  { value: 'sql', label: 'SQL' },
  { value: 'php', label: 'PHP' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'swift', label: 'Swift' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'yaml', label: 'YAML' },
  { value: 'xml', label: 'XML' },
];

export const CodeBlockComponent = ({ node, updateAttributes }: CodeBlockComponentProps) => {
  const [isSelectOpen, setIsSelectOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const currentLanguage = node.attrs.language || 'auto';

  const handleLanguageChange = (language: string) => {
    updateAttributes({ language });
    setIsSelectOpen(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsSelectOpen(false);
      }
    };

    if (isSelectOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSelectOpen]);

  return (
    <NodeViewWrapper className="code-block-wrapper relative">
      <div className="absolute -top-2 -right-1 z-10" ref={dropdownRef}>
        <div className="relative">
          <button
            onClick={() => setIsSelectOpen(!isSelectOpen)}
            className="px-2 py-1 text-xs bg-ui-dropdown hover:bg-ui-dropdown-hover text-ui-dropdown rounded border border-ui-dropdown/70 transition-colors"
          >
            {LANGUAGES.find(l => l.value === currentLanguage)?.label || 'Auto'}
          </button>
          {isSelectOpen && (
            <div className="absolute right-0 top-full mt-1 bg-ui-dropdown border border-ui-dropdown/60 rounded shadow-lg max-h-60 overflow-y-auto min-w-[120px] z-20">
              {LANGUAGES.map(lang => (
                <button
                  key={lang.value}
                  onClick={() => handleLanguageChange(lang.value)}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-ui-dropdown-hover transition-colors ${
                    currentLanguage === lang.value ? 'bg-ui-dropdown-active text-white' : 'text-ui-dropdown'
                  }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <pre>
        <NodeViewContent />
      </pre>
    </NodeViewWrapper>
  );
};
