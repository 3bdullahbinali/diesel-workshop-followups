'use strict';
/** Regression checks for typed procurement filters: node tools/test-procurement-types.js */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sandbox = {};
const root = path.join(__dirname, '..');
for (const file of ['procurement-model.js', 'sheets.js']) {
  new Function('globalThis', fs.readFileSync(path.join(root, file), 'utf8'))(sandbox);
}
const P = sandbox.WorkshopProcurement;
const S = sandbox.WorkshopSheets;
const clone = value => JSON.parse(JSON.stringify(value));
const prepared = JSON.parse(fs.readFileSync(path.join(root, 'data.json'), 'utf8'));
let passed = 0, failed = 0;
function test(label, run) {
  try { run(); passed++; console.log('✓ ' + label); }
  catch (error) { failed++; console.error('✗ ' + label + '\n  ' + error.message); }
}

// Keep the real snapshot's groups and metadata; each read gets an isolated copy.
function fixture(meta = {}) {
  const snapshot = clone(prepared);
  const item = {
    id:'fixture-purchase', baseIds:[], kind:'new', title:'أدوات الورشة',
    priority:'medium', stage:'preparation', action:'إعداد الطلب', owner:'فريق الورشة',
    informationDate:'2026-10-28', updatedAt:'2026-10-28T06:45:00.000Z',
    status:'قيد الإعداد', followUpWith:'الورشة', group:'purchase-action', dueDate:null,
    reference:'مرجع محفوظ', notes:'ملاحظات محفوظة', evidence:'sheet',
    sources:[{title:'مرجع سابق', locator:'تفاصيل المرجع السابق', date:'2026-10-26', type:'conversation'}],
    history:[{date:'2026-10-26', status:'حالة سابقة محفوظة', source:'توجيه سابق'}],
    area:'procurement', actionAt:'team',
    procurement:{kind:'unregistered', stage:'preparation', amountAed:2488,
      budgetCode:'222302', amountBasis:'estimated', linkedItemIds:[], ...meta}
  };
  snapshot.items = [item];
  return snapshot;
}
function sourceRows(snapshot) {
  return snapshot.items.flatMap(item => [
    ...item.sources.map(source => [item.id,'مرجع',source.date,source.title,source.locator]),
    ...item.history.map(history => [item.id,'حالة سابقة',history.date,'',history.status])
  ]);
}
function rowFor(snapshot, width = 26, overrides = {}) {
  const item = snapshot.items[0], meta = item.procurement || {};
  const row = Array(width).fill('');
  Object.assign(row, {
    0:item.id, 1:item.title, 2:item.priority, 3:item.stage, 4:item.action, 5:item.owner,
    6:item.informationDate, 7:meta.prNumber || '', 8:meta.amountAed ?? '',
    9:meta.budgetCode || '', 10:item.status, 11:item.followUpWith, 12:item.group,
    13:item.dueDate || '', 14:'28/10/2026 10:45:00', 15:item.reference, 16:item.notes,
    17:meta.kind || '', 18:meta.stage || '', 19:meta.numberType || '',
    20:meta.lpoNumber || '', 21:meta.amountBasis || '', 22:meta.amountNote || ''
  });
  if (width > 23) row[23] = item.area || '';
  if (width > 24) row[24] = item.actionAt || '';
  return Object.assign(row, overrides);
}
function read(snapshot, width = 26, overrides = {}) {
  return S.merge(snapshot, [rowFor(snapshot, width, overrides)], sourceRows(snapshot)).items[0];
}
function response(headers, rows) {
  return {status:'ok', table:{cols:headers.map(label => ({label})),
    rows:rows.map(row => ({c:row.map(v => v === null ? null : {v})}))}};
}
const extraHeaders = () => [...S.optionalHeaders, ...S.transactionHeaders];

test('all four transaction filters have stable canonical keys', () => {
  assert.deepEqual(P.transactionTypes.map(([id]) => id), ['all','pr','direct','contract','petty_cash']);
});
test('explicit transaction type takes priority over legacy kind', () => {
  for (const type of ['pr','direct','contract','petty_cash']) {
    assert.equal(P.transactionType({kind:'dpr', transactionType:type}), type);
  }
});
test('legacy direct requests retain their direct-purchase classification', () => {
  assert.equal(P.transactionType({kind:'dpr'}), 'direct');
});
test('unnumbered and other legacy kinds remain in purchase requests by default', () => {
  for (const kind of ['pr','unregistered','unnumbered','request','lpo','lpo_only','planning','linked']) {
    assert.equal(P.transactionType({kind}), 'pr');
  }
});
test('titles, notes and number labels cannot invent a transaction type', () => {
  assert.equal(P.transactionType({kind:'unregistered', numberType:'Petty Cash',
    title:'نثريات وشراء مباشر', notes:'عقد / تسوية', reference:'DPR'}), 'pr');
});
test('all five petty-cash phases remain available even when counts are zero', () => {
  assert.deepEqual(P.pettyCashStages.map(([id]) => id),
    ['all','preparation','approvals','execution_payment','settlement','closure']);
});
test('blank phase derives preparation, approvals and execution from existing stages', () => {
  const cases = {preparation:'preparation', approvals:'approvals',
    pr_team_approval:'approvals', warehouse_approval:'approvals',
    in_progress:'execution_payment', delivery:'execution_payment', partial_delivery:'execution_payment'};
  for (const [stage, phase] of Object.entries(cases)) assert.equal(P.cashStage({stage}), phase);
});
test('settlement requires an explicit compatible phase', () => {
  assert.equal(P.cashStage({stage:'in_progress', transactionStage:'settlement'}), 'settlement');
  assert.equal(P.cashStage({stage:'in_progress', status:'التسوية'}), 'execution_payment');
});
test('changing the general stage makes a stale optional phase ineffective', () => {
  assert.equal(P.cashStage({stage:'approvals', transactionStage:'settlement'}), 'approvals');
  assert.equal(P.cashStage({stage:'in_progress', transactionStage:'preparation'}), 'execution_payment');
  assert.equal(P.cashStage({stage:'closure', transactionStage:'settlement'}), 'closure');
});
test('pending closure remains open; confirmed completion still belongs to the archive', () => {
  assert.equal(P.cashStage({stage:'closure'}), 'closure');
  assert.equal(P.isClosed({stage:'closure'}), false);
  assert.equal(P.cashStage({stage:'completed'}), 'closure');
  assert.equal(P.isClosed({stage:'completed'}), true);
});
test('an unmapped cash stage has a visible other bucket and keeps its original label', () => {
  const meta = {transactionType:'petty_cash', stage:'coordination'};
  assert.equal(P.cashStage(meta), 'other');
  assert.equal(P.stageLabel(meta), P.stageLabels.coordination);
});
test('cash-specific labels do not change standard purchase-stage labels', () => {
  assert.equal(P.stageLabel({transactionType:'petty_cash', stage:'in_progress', transactionStage:'settlement'}), 'التسوية');
  assert.equal(P.stageLabel({transactionType:'pr', stage:'in_progress', transactionStage:'settlement'}), P.stageLabels.in_progress);
});

test('legacy 23-column and 26-column rows remain readable', () => {
  for (const width of [23,26]) {
    const snapshot = fixture();
    const item = read(snapshot, width);
    assert.equal(item.procurement.kind, 'unregistered');
    assert.equal(item.procurement.stage, 'preparation');
    assert.equal(item.procurement.amountAed, 2488);
    assert.equal(P.transactionType(item.procurement), 'pr');
  }
});
test('absent optional columns preserve prepared classification and snapshot history', () => {
  const snapshot = fixture({transactionType:'petty_cash', transactionStage:'preparation'});
  const before = clone(snapshot), item = read(snapshot, 26);
  assert.equal(item.procurement.transactionType, 'petty_cash');
  assert.equal(item.procurement.transactionStage, 'preparation');
  assert.deepEqual(item.sources, before.items[0].sources);
  assert.deepEqual(item.history, before.items[0].history);
  assert.deepEqual(snapshot, before, 'reader mutated the prepared snapshot');
});
test('canonical values in AA/AB are read without changing request kind or stage', () => {
  const item = read(fixture(), 28, {26:'petty_cash',27:'preparation'});
  assert.equal(item.procurement.transactionType, 'petty_cash');
  assert.equal(item.procurement.transactionStage, 'preparation');
  assert.equal(item.procurement.kind, 'unregistered');
  assert.equal(item.procurement.stage, 'preparation');
  assert.equal(item.stage, 'preparation');
});
test('Arabic type and phase labels resolve to the same canonical values', () => {
  const item = read(fixture(), 28, {3:'in_progress',18:'in_progress',26:'النثريات',27:'التسوية'});
  assert.equal(item.procurement.transactionType, 'petty_cash');
  assert.equal(item.procurement.transactionStage, 'settlement');
  assert.equal(P.cashStage(item.procurement), 'settlement');
});
test('empty AA/AB cells authoritatively clear earlier fallback metadata', () => {
  const snapshot = fixture({transactionType:'petty_cash', transactionStage:'preparation'});
  const before = clone(snapshot), item = read(snapshot, 28);
  assert.equal(Object.hasOwn(item.procurement, 'transactionType'), false);
  assert.equal(Object.hasOwn(item.procurement, 'transactionStage'), false);
  assert.equal(P.transactionType(item.procurement), 'pr');
  assert.deepEqual(snapshot, before);
});
test('clearing AB keeps the explicit type and restores the general-stage phase', () => {
  const snapshot = fixture({stage:'in_progress', transactionType:'petty_cash', transactionStage:'settlement'});
  snapshot.items[0].stage = 'in_progress';
  const item = read(snapshot, 28, {26:'petty_cash',27:''});
  assert.equal(P.transactionType(item.procurement), 'petty_cash');
  assert.equal(P.cashStage(item.procurement), 'execution_payment');
});
test('an explicit transaction type alone establishes an unnumbered purchase record', () => {
  const snapshot = fixture();
  delete snapshot.items[0].procurement;
  const item = read(snapshot, 28, {26:'petty_cash'});
  assert.equal(item.procurement.kind, 'unregistered');
  assert.equal(item.procurement.transactionType, 'petty_cash');
});
test('operational fields or a phase alone do not turn a general task into procurement', () => {
  const snapshot = fixture();
  delete snapshot.items[0].procurement;
  const item = read(snapshot, 28, {23:'maintenance',24:'team',25:'متابعة فنية',27:'preparation'});
  assert.equal(Boolean(item.procurement), false);
});
test('invalid explicit classification is rejected with its item identifier', () => {
  assert.throws(() => read(fixture(), 28, {26:'not-a-real-type'}), /نوع المعاملة في بند fixture-purchase/);
  assert.throws(() => read(fixture(), 28, {26:'petty_cash',27:'not-a-real-phase'}), /مرحلة المعاملة في بند fixture-purchase/);
});
test('GViz header parsing accepts both legacy widths and the new optional columns', () => {
  for (const width of [23,26,27,28]) {
    const headers = [...S.headers,...extraHeaders()].slice(0,width);
    const values = rowFor(fixture(), width, width > 26 ? {26:'النثريات'} : {});
    if (width > 27) values[27] = 'الإعداد';
    const rows = S.tableRows(response(headers, [values]), S.headers, extraHeaders());
    assert.equal(rows[0].length, width);
    assert.equal(rows[0][0], 'fixture-purchase');
    if (width > 26) assert.equal(rows[0][26], 'النثريات');
  }
});
test('a blank but present GViz column remains present so clearing is respected', () => {
  const snapshot = fixture({transactionType:'petty_cash', transactionStage:'preparation'});
  const rows = S.tableRows(response([...S.headers,...extraHeaders()], [rowFor(snapshot,28)]), S.headers, extraHeaders());
  const item = S.merge(snapshot, rows, sourceRows(snapshot)).items[0];
  assert.equal(Object.hasOwn(item.procurement, 'transactionType'), false);
  assert.equal(Object.hasOwn(item.procurement, 'transactionStage'), false);
});
test('misordered optional headers fail clearly rather than misclassifying records', () => {
  const headers = [...S.headers,...S.optionalHeaders,...S.transactionHeaders.slice().reverse()];
  assert.throws(() => S.tableRows(response(headers,[rowFor(fixture(),28)]),S.headers,extraHeaders()), /عناوين أعمدة/);
});

test('type and phase filtering accounts for each open record exactly once', () => {
  const make = (id,meta) => ({...clone(fixture().items[0]), id, stage:meta.stage || 'preparation',
    procurement:{kind:'unregistered',stage:'preparation',...meta}});
  const items = [make('standard',{}), make('direct',{kind:'dpr'}),
    make('contract',{transactionType:'contract'}),
    make('cash-preparation',{transactionType:'petty_cash'}),
    make('cash-settlement',{transactionType:'petty_cash',stage:'in_progress',transactionStage:'settlement'}),
    make('cash-other',{transactionType:'petty_cash',stage:'coordination'}),
    make('cash-closed',{transactionType:'petty_cash',stage:'completed'}),
    make('linked',{kind:'linked',parentItemId:'standard'})];
  const open = P.getRows({items}).filter(({item}) => !P.isClosed(item));
  const counts = Object.fromEntries(P.transactionTypes.filter(([key]) => key !== 'all')
    .map(([key]) => [key,open.filter(({meta}) => P.transactionType(meta) === key).length]));
  assert.deepEqual(counts, {pr:1,direct:1,contract:1,petty_cash:3});
  assert.equal(Object.values(counts).reduce((a,b) => a+b,0),open.length);
  const cash = open.filter(({meta}) => P.transactionType(meta) === 'petty_cash');
  assert.deepEqual(cash.map(({meta}) => P.cashStage(meta)).sort(), ['other','preparation','settlement']);
  assert.equal(P.getRows({items}).find(({item}) => item.id === 'standard').linked.length,1);
});

console.log(`\n${passed} passed; ${failed} failed.`);
process.exitCode = failed ? 1 : 0;
