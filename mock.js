
import { BasicSelectionModel, CellGroup, DataGrid, DataModel } from '@lumino/datagrid';
import { MessageLoop } from '@lumino/messaging';
import { Widget } from '@lumino/widgets';

class Model extends DataModel {
  rowCount(r) { return r === 'body' ? 6 : 1; }
  columnCount(r) { return r === 'body' ? 4 : 1; }
  data(region, row, col) {
    if (region === 'body') return row === 3 ? (col === 0 ? '# comment line, merged across all columns' : '') : `${row},${col}`;
    return region === 'column-header' ? `col ${col}` : `${row}`;
  }
  groupCount(r) { return r === 'body' ? 1 : 0; }
  group(r, i) { return { r1: 3, r2: 3, c1: 0, c2: 3 }; }
}

function draw(mode) {
  return function () {
    const model = this._selectionModel;
    if (!model || model.isEmpty) return;
    const fill = this._style.selectionFillColor, stroke = this._style.selectionBorderColor;
    const sx = this._scrollX, sy = this._scrollY, hw = this.headerWidth, hh = this.headerHeight;
    const pw = this.pageWidth, ph = this.pageHeight;
    const maxRow = this._rowSections.count - 1, maxColumn = this._columnSections.count - 1;
    const gc = this._overlayGC;
    gc.save(); gc.beginPath(); gc.rect(hw, hh, pw, ph); gc.clip();
    const box = g => {
      const x1 = this._columnSections.offsetOf(g.c1) - sx + hw, y1 = this._rowSections.offsetOf(g.r1) - sy + hh;
      const x2 = this._columnSections.extentOf(g.c2) - sx + hw, y2 = this._rowSections.extentOf(g.r2) - sy + hh;
      return [x1, y1, x2 - x1 + 1, y2 - y1 + 1];
    };
    for (const s of model.selections()) {
      const c = v => Math.max(0, v);
      let g = { r1: c(Math.min(s.r1, s.r2)), r2: Math.min(Math.max(s.r1, s.r2), maxRow),
                c1: c(Math.min(s.c1, s.c2)), c2: Math.min(Math.max(s.c1, s.c2), maxColumn) };
      if (mode === 'bbox') g = CellGroup.joinCellGroupWithMergedCellGroups(this.dataModel, g, 'body');
      const rects = [box(g)];
      if (mode === 'touch') {
        for (const m of CellGroup.getCellGroupsAtRegion(this.dataModel, 'body')) {
          if (CellGroup.areCellGroupsIntersecting(g, m)) rects.push(box(m));
        }
      }
      // One path, so overlapping rectangles are filled once.
      gc.beginPath();
      for (const r of rects) gc.rect(...r);
      gc.fillStyle = fill; gc.fill('nonzero');
      // The union's outline: each rectangle's border, except where it runs inside another.
      gc.strokeStyle = stroke; gc.lineWidth = 1;
      rects.forEach((r, i) => {
        gc.save();
        gc.beginPath();
        gc.rect(0, 0, 10000, 10000);
        rects.forEach((o, j) => { if (j !== i) gc.rect(o[0] + 1, o[1] + 1, o[2] - 2, o[3] - 2); });
        gc.clip('evenodd');
        gc.strokeRect(r[0] - 0.5, r[1] - 0.5, r[2], r[3]);
        gc.restore();
      });
    }
    gc.restore();
  };
}

const variants = [
  ['main today', 'bbox', 'stored'],
  ['1: joined where made, drawn as stored', 'asis', 'joined'],
  ['2a: stored as made, drawn exactly', 'asis', 'made'],
  ['2b: stored as made, drawn with the merged cells it touches', 'touch', 'made'],
];

// Each scenario: what the selection model holds under main, under option 1
// (joined at creation), and under option 2 (as made); and the cursor.
const scenarios = [
  { title: 'A. Click the "col 1" header', cursor: [0, 1],
    stored: { r1: 0, c1: 0, r2: 5, c2: 3 }, joined: { r1: 0, c1: 1, r2: 5, c2: 1 }, made: { r1: 0, c1: 1, r2: 5, c2: 1 } },
  { title: 'B. Drag from 1,1 down to 5,1', cursor: [1, 1],
    stored: { r1: 1, c1: 1, r2: 5, c2: 1 }, joined: { r1: 1, c1: 0, r2: 5, c2: 3 }, made: { r1: 1, c1: 1, r2: 5, c2: 1 } },
  { title: 'C. Click the merged cell (row 3, under col 1): the cursor covers it everywhere', cursor: [3, 1],
    stored: { r1: 3, c1: 1, r2: 3, c2: 1 }, joined: { r1: 3, c1: 1, r2: 3, c2: 1 }, made: { r1: 3, c1: 1, r2: 3, c2: 1 } },
  { title: 'D. Cursor on 2,3, Shift+Down', cursor: [2, 3],
    stored: { r1: 2, c1: 3, r2: 3, c2: 3 }, joined: { r1: 2, c1: 0, r2: 3, c2: 3 }, made: { r1: 2, c1: 3, r2: 3, c2: 3 } },
  { title: 'E. ... then Shift+Up', cursor: [2, 3],
    stored: { r1: 2, c1: 3, r2: 2, c2: 3 }, joined: { r1: 2, c1: 0, r2: 2, c2: 3 }, made: { r1: 2, c1: 3, r2: 2, c2: 3 } },
];

const root = document.getElementById('root');
const fmt = s => `{r1: ${s.r1}, c1: ${s.c1}, r2: ${s.r2}, c2: ${s.c2}}`;
scenarios.forEach((sc, k) => {
  const box = document.createElement('div'); box.className = 'scenario'; box.id = 'scenario-' + k;
  box.innerHTML = `<h2>${sc.title}</h2><div class="row"></div>`;
  root.appendChild(box);
  const row = box.querySelector('.row');
  for (const [label, mode, which] of variants) {
    const cell = document.createElement('div'); cell.className = 'cell';
    cell.innerHTML = `<h3>${label}</h3><div class="grid"></div><div class="note">stored ${fmt(sc[which])}</div>`;
    row.appendChild(cell);
    const model = new Model();
    const grid = new DataGrid({ defaultSizes: { rowHeight: 24, columnWidth: 72, rowHeaderWidth: 40, columnHeaderHeight: 24 } });
    grid.dataModel = model;
    grid.selectionModel = new BasicSelectionModel({ dataModel: model });
    grid._drawBodySelections = draw(mode);
    Widget.attach(grid, cell.querySelector('.grid'));
    const s = sc[which];
    grid.selectionModel.select({ ...s, cursorRow: sc.cursor[0], cursorColumn: sc.cursor[1], clear: 'all' });
    grid.node.style.position = 'absolute'; grid.node.style.inset = '0';
    MessageLoop.sendMessage(grid, Widget.ResizeMessage.UnknownSize);
  }
});
window.__ready = true;
