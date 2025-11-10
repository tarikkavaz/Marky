import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';

interface FootnoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (id: string, content: string) => void;
  defaultId?: string;
}

export function FootnoteDialog({
  open,
  onOpenChange,
  onSubmit,
  defaultId = '',
}: FootnoteDialogProps) {
  const [id, setId] = useState(defaultId);
  const [content, setContent] = useState('');

  useEffect(() => {
    if (open) {
      // Generate default ID if not provided
      const nextId = defaultId || '1';
      setId(nextId);
      setContent('');
    }
  }, [open, defaultId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (id.trim() && content.trim()) {
      onSubmit(id.trim(), content.trim());
      setId('');
      setContent('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Insert Footnote</DialogTitle>
            <DialogDescription>
              Enter the footnote identifier and content.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="footnote-id">Footnote ID</Label>
              <Input
                id="footnote-id"
                autoFocus
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="1"
                className="col-span-4"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="footnote-content">Footnote Content</Label>
              <Textarea
                id="footnote-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Enter footnote content..."
                className="col-span-4 min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setId('');
                setContent('');
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!id.trim() || !content.trim()}>
              Insert
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
