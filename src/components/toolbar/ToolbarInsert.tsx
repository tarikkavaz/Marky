import { useState, useImperativeHandle, forwardRef } from 'react';
import { InputDialog } from '../dialogs/InputDialog';
import { createInsertionCommands } from '../editor/utils/commands';
import type { Editor } from '@tiptap/react';

export interface ToolbarInsertRef {
  openLinkDialog: () => void;
  openTableDialog: () => void;
}

interface ToolbarInsertProps {
  editor: Editor;
}

export const ToolbarInsert = forwardRef<ToolbarInsertRef, ToolbarInsertProps>(
  ({ editor }, ref) => {
    const [linkDialogOpen, setLinkDialogOpen] = useState(false);
    const [tableRowsDialogOpen, setTableRowsDialogOpen] = useState(false);
    const [tableColsDialogOpen, setTableColsDialogOpen] = useState(false);
    const [pendingTableRows, setPendingTableRows] = useState<number>(3);

    const insertionCommands = createInsertionCommands(editor);

    useImperativeHandle(ref, () => ({
      openLinkDialog: () => setLinkDialogOpen(true),
      openTableDialog: () => setTableRowsDialogOpen(true),
    }));

    const handleLinkSubmit = (url: string) => {
      insertionCommands.setLink(url);
    };

    const handleTableRowsSubmit = (rows: string) => {
      const numRows = parseInt(rows, 10);
      if (!isNaN(numRows) && numRows > 0 && numRows <= 20) {
        setPendingTableRows(numRows);
        setTableColsDialogOpen(true);
      }
    };

    const handleTableColsSubmit = (cols: string) => {
      const numCols = parseInt(cols, 10);
      if (!isNaN(numCols) && numCols > 0 && numCols <= 20) {
        insertionCommands.insertTable(pendingTableRows, numCols);
      }
    };

    return (
      <>
        <InputDialog
          open={linkDialogOpen}
          onOpenChange={setLinkDialogOpen}
          title="Insert Link"
          description="Enter the URL for the link"
          placeholder="https://example.com"
          defaultValue="https://"
          onSubmit={handleLinkSubmit}
        />
        <InputDialog
          open={tableRowsDialogOpen}
          onOpenChange={setTableRowsDialogOpen}
          title="Table Rows"
          description="How many rows?"
          placeholder="3"
          defaultValue="3"
          onSubmit={handleTableRowsSubmit}
        />
        <InputDialog
          open={tableColsDialogOpen}
          onOpenChange={setTableColsDialogOpen}
          title="Table Columns"
          description="How many columns?"
          placeholder="3"
          defaultValue="3"
          onSubmit={handleTableColsSubmit}
        />
      </>
    );
  }
);

ToolbarInsert.displayName = 'ToolbarInsert';
