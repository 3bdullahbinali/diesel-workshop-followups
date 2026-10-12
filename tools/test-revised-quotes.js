'use strict';
// Verify the service -> Sheet -> procurement display boundary without live writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const service = vm.createContext({Date});
vm.runInContext(fs.readFileSync(path.join(root, 'apps-script/workshop-api.gs'), 'utf8'), service);
const site = {};
for (const file of ['sheets.js', 'procurement-model.js']) {
  new Function('globalThis', fs.readFileSync(path.join(root, file), 'utf8'))(site);
}
const S = site.WorkshopSheets, P = site.WorkshopProcurement;
const label = 'بانتظار عروض الأسعار المعدّلة';
const rawRows = ['quotes', 'revised_quotes', 'evaluation'].map((stage, i) => {
  const row = service.rowValues({title:'Test request '+i, priority:'medium', stage,
    group:'quotes', action:'Follow up', owner:'Test', informationDate:'2026-10-12',
    procurement:{enabled:true, kind:'pr', stage, prNumber:'TEST-'+i, amountAed:''}});
  row[0]='test-'+i;
  // gviz serializes Sheet dates before the browser reader receives them.
  row[6]='2026-10-12';
  return Array.from(row);
});
assert.equal(rawRows[1][3], label);
assert.equal(rawRows[1][18], label);
const data = S.merge({items:[], groups:[{id:'quotes',label:'بانتظار العروض'}], sync:{}}, rawRows, []);
const rows = P.getRows(data);
assert.deepEqual(rows.map(row=>row.meta.stage), ['quotes','revised_quotes','evaluation']);
assert.equal(rows.filter(row=>P.displayStage(row.meta.stage)==='revised_quotes').length, 1);
assert.equal(P.metrics(rows).quotes, 1);
assert.equal(P.metrics(rows).received, 1);
assert.equal(P.isClosed(rows[1].item), false);
const ids = P.primaryStages.map(([id])=>id);
assert.equal(ids[ids.indexOf('quotes')+1], 'revised_quotes');
assert.equal(ids[ids.indexOf('revised_quotes')+1], 'offers_evaluation');
assert.equal(S.stages.revised_quotes, label);
assert.throws(()=>service.label('invalid-stage',service.STAGES,'الحالة'));
console.log('Revised quotation stage: save/read round-trip, separate count, filter order and existing stages passed.');
