import { Button } from '../ui/button';
import type { LucideIcon } from 'lucide-react';

interface ToolbarButtonProps {
  icon: LucideIcon;
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  title: string;
}

export function ToolbarButton({ 
  icon: Icon, 
  onClick, 
  isActive = false, 
  disabled = false,
  title 
}: ToolbarButtonProps) {
  return (
    <Button
      variant={isActive ? 'default' : 'ghost'}
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className="h-8 w-8 p-0"
      title={title}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}
