// Simple table to markdown converter
export function tableToMarkdown(table: HTMLTableElement): string {
  const rows: string[] = [];
  const cells: string[][] = [];

  // Extract all rows
  table.querySelectorAll('tr').forEach((row) => {
    const rowCells: string[] = [];
    row.querySelectorAll('td, th').forEach((cell) => {
      rowCells.push(cell.textContent?.trim() || '');
    });
    if (rowCells.length > 0) {
      cells.push(rowCells);
    }
  });

  if (cells.length === 0) return '';

  // Build markdown table
  cells.forEach((row, index) => {
    rows.push('| ' + row.join(' | ') + ' |');
    
    // Add separator after header row
    if (index === 0) {
      rows.push('| ' + row.map(() => '---').join(' | ') + ' |');
    }
  });

  return rows.join('\n');
}
