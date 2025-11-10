import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface AboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AboutDialog({ open, onOpenChange }: AboutDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold text-center">Marky</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="text-center text-sm text-muted-foreground">
            Version 0.1.0
          </div>
          <div className="text-center text-sm">
            A modern markdown editor built with Tauri and React.
          </div>
          <div className="text-center text-xs text-muted-foreground pt-4 border-t">
            © 2024 Tarik Kavaz
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
