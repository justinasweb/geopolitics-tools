// Sortable data tables: each th[data-key] has a button; numeric columns (data-type="num") sort by each cell's
// data-v, and an empty data-v sorts last in both directions.

export function initSortable(table: HTMLTableElement): void {
  if (table.dataset.sortReady) return;
  table.dataset.sortReady = '1';
  const ths = [...table.querySelectorAll<HTMLTableCellElement>('thead th[data-key]')];
  for (const th of ths) {
    th.querySelector('button')?.addEventListener('click', () => {
      const dir = th.getAttribute('aria-sort') === 'descending' ? 'ascending' : 'descending';
      for (const o of ths) o.removeAttribute('aria-sort');
      th.setAttribute('aria-sort', dir);
      const col = th.cellIndex;
      const num = th.dataset.type === 'num';
      const body = table.tBodies[0];
      const val = (r: HTMLTableRowElement) => r.cells[col]?.dataset.v ?? r.cells[col]?.textContent ?? '';
      const rows = [...body.rows].sort((a, b) => {
        const x = val(a), y = val(b);
        if (x === '' || y === '') return x === y ? 0 : x === '' ? 1 : -1;
        const c = num ? Number(x) - Number(y) : x.localeCompare(y);
        return dir === 'ascending' ? c : -c;
      });
      body.append(...rows);
    });
  }
}
