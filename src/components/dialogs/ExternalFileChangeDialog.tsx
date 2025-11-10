import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';

interface ExternalFileChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReload: () => void;
  onKeepCurrent: () => void;
  onCancel: () => void;
  filePath: string;
  hasUnsavedChanges: boolean;
}

export function ExternalFileChangeDialog({
  open,
  onOpenChange,
  onReload,
  onKeepCurrent,
  onCancel,
  filePath,
  hasUnsavedChanges,
}: ExternalFileChangeDialogProps) {
  const fileName = filePath.split('/').pop() || filePath;
  const message = hasUnsavedChanges
    ? `The file "${fileName}" has been modified outside the app. You have unsaved changes. What would you like to do?`
    : `The file "${fileName}" has been modified outside the app. Would you like to reload it?`;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>File Changed Externally</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          {hasUnsavedChanges && (
            <AlertDialogAction onClick={onKeepCurrent} className="bg-yellow-600/80 hover:bg-yellow-600/90 text-white">
              Keep Current
            </AlertDialogAction>
          )}
          <AlertDialogAction
            onClick={onReload}
            className={hasUnsavedChanges ? 'bg-red-600/80 hover:bg-red-600/90 text-white' : ''}
          >
            {hasUnsavedChanges ? 'Reload (Discard Changes)' : 'Reload'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
