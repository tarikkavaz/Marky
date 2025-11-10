import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface HelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HelpDialog({ open, onOpenChange }: HelpDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="h-screen !w-screen !max-w-none max-h-none m-0 p-0 rounded-none top-0 left-0 !translate-x-0 !translate-y-0"
        showCloseButton={true}
      >
        <div className="flex flex-col h-full w-full">
          <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
            <DialogTitle>Help</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto px-6 py-4 w-full">
            <div className="prose max-w-none w-full">
              <h2>Welcome to Marky</h2>
              <p>Help content will be provided here.</p>
              {/* Content will be added later */}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
