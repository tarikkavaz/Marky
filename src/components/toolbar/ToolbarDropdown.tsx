import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import type { LucideIcon } from 'lucide-react';

interface ToolbarDropdownItem {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  shortcut?: string;
}

interface ToolbarDropdownSubmenu {
  label: string;
  icon?: LucideIcon;
  items: ToolbarDropdownItem[];
}

interface ToolbarDropdownProps {
  icon: LucideIcon;
  label: string;
  items?: ToolbarDropdownItem[];
  submenus?: ToolbarDropdownSubmenu[];
  isActive?: boolean;
  disabled?: boolean;
}

export function ToolbarDropdown({
  icon: Icon,
  label,
  items = [],
  submenus = [],
  isActive = false,
  disabled = false,
}: ToolbarDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={isActive ? 'default' : 'ghost'}
          size="sm"
          disabled={disabled}
          className="h-8 w-8 p-0"
          title={label}
        >
          <Icon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {items.map((item, index) => {
          const ItemIcon = item.icon;
          return (
            <DropdownMenuItem
              key={index}
              onClick={item.onClick}
              disabled={item.disabled}
              className={item.isActive ? 'bg-accent' : ''}
            >
              {ItemIcon && <ItemIcon className="mr-2 h-4 w-4" />}
              <span className={item.isActive ? 'font-bold' : ''}>{item.label}</span>
              {item.shortcut && (
                <span className="ml-auto text-xs text-muted-foreground">{item.shortcut}</span>
              )}
            </DropdownMenuItem>
          );
        })}
        {items.length > 0 && submenus.length > 0 && <DropdownMenuSeparator />}
        {submenus.map((submenu, index) => {
          const SubmenuIcon = submenu.icon;
          return (
            <DropdownMenuSub key={index}>
              <DropdownMenuSubTrigger>
                {SubmenuIcon && <SubmenuIcon className="mr-2 h-4 w-4" />}
                {submenu.label}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {submenu.items.map((item, itemIndex) => {
                  const ItemIcon = item.icon;
                  return (
                    <DropdownMenuItem
                      key={itemIndex}
                      onClick={item.onClick}
                      disabled={item.disabled}
                      className={item.isActive ? 'bg-accent' : ''}
                    >
                      {ItemIcon && <ItemIcon className="mr-2 h-4 w-4" />}
                      <span className={item.isActive ? 'font-bold' : ''}>{item.label}</span>
                      {item.shortcut && (
                        <span className="ml-auto text-xs text-muted-foreground">{item.shortcut}</span>
                      )}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
