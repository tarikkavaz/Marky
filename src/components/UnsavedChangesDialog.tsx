import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';

interface UnsavedChangesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDontSave: () => void;
  onSave?: () => void;
  onCancel: () => void;
  message?: string;
}

export function UnsavedChangesDialog({
  open,
  onOpenChange,
  onDontSave,
  onSave,
  onCancel,
  message = 'Do you want to save the changes you made?',
}: UnsavedChangesDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onDontSave} className="bg-red-600/80 hover:bg-red-600/90 text-white">
            Don't Save
          </AlertDialogAction>
          {onSave && (
            <AlertDialogAction onClick={onSave}>Save</AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
