import { useEffect, useRef } from 'react';
import { highlight, languages } from 'prismjs';
import Editor from 'react-simple-code-editor';
import 'prismjs/components/prism-markdown';
import { EditorContextMenu } from './EditorContextMenu';
import { type Editor as TipTapEditor } from '@tiptap/react';

interface SourceViewProps {
  markdown: string;
  onChange: (markdown: string) => void;
  editor: TipTapEditor | null;
  currentFilePath?: string | null;
}

export function SourceView({ markdown, onChange, editor, currentFilePath }: SourceViewProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Focus the editor when component mounts or markdown changes externally
  useEffect(() => {
    // Small delay to ensure the editor is rendered
    const timer = setTimeout(() => {
      if (textareaRef.current) {
        // Don't auto-focus as it might be annoying
        // textareaRef.current.focus();
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [markdown]);

  const handleValueChange = (code: string) => {
    onChange(code);
  };

  return (
    <EditorContextMenu editor={editor} currentFilePath={currentFilePath}>
      <div className="w-full h-full overflow-auto">
        <Editor
          value={markdown}
          onValueChange={handleValueChange}
          highlight={(code) => highlight(code, languages.markdown, 'markdown')}
          padding={32}
          style={{
            fontFamily: '"Fira Code", "Fira Mono", "Consolas", "Monaco", "Courier New", monospace',
            fontSize: 14,
            lineHeight: 1.6,
            minHeight: '100%',
            width: '100%',
            backgroundColor: 'transparent',
            color: 'inherit',
            outline: 'none',
            border: 'none',
          }}
          textareaClassName="source-editor-textarea"
          preClassName="source-editor-pre"
          textareaRef={(ref) => {
            textareaRef.current = ref;
          }}
        />
      </div>
    </EditorContextMenu>
  );
}
