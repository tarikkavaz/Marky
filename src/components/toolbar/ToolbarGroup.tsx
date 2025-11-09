import type { ReactNode } from 'react';

interface ToolbarGroupProps {
  children: ReactNode;
}

export function ToolbarGroup({ children }: ToolbarGroupProps) {
  return (
    <>
      <div className="flex items-center gap-0.5">
        {children}
      </div>
      <div className="w-px h-6 bg-border mx-1" />
    </>
  );
}
