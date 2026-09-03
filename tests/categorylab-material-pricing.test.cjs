const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const html = readFileSync(process.env.CATEGORYLAB_HTML || join(__dirname, '../decks/category-lab/categorylab.html'), 'utf8');
function extract(name) {
  const start = html.indexOf(`    function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}`);
  return html.slice(start, html.indexOf('\n    }', start) + 6);
}
const functions = ['n', 'pct', 'fmt', 'normalizeSpecKg', 'getMaterial', 'calcUnitPrice',
  'calcLine', 'migrateMaterial', 'fillMaterialForm', 'updateMaterialUnitPrice', 'saveMaterial', 'persist',
  'recipeMaterialExportRows'].map(extract).join('\n');

function form(values = {}, existing = null) {
  const fields = {};
  for (const [id, value] of Object.entries({ matCode: 'TEST-PRICE', matName: 'Synthetic material',
    matCategory: 'Test', matSpec: '', matPackagePrice: '', matUnitPrice: '',
    matSupplier: '', matSource: '', matNote: '', ...values })) {
    let currentValue = String(value);
    fields[`#${id}`] = { id, get value() { return currentValue; }, set value(v) { currentValue = v == null ? '' : String(v); } };
  }
  const saved = new Map();
  const materialForm = { dataset: {} };
  const context = vm.createContext({
    document: { querySelector: selector => fields[selector] },
    els: { materialForm, materialFormTitle: {}, matImagePreview: { dataset: {}, removeAttribute() {}, classList: { toggle() {} } } },
    state: { materials: existing ? [existing] : [] },
    selectedMaterialCode: existing?.code || null,
    STORAGE_KEY: 'synthetic', localStorage: { setItem: (key, value) => saved.set(key, value) },
    clearMaterialForm() {}, closeModal() {}, renderAll() {}, scheduleLaunchReminderSync() {},
    ensureSelectOption() {}, setImagePreviewTarget() {}, setupSelectOptions() {}, openModal() {},
    validStoredImage: () => false, taobaoMaterialImages: {}
  });
  vm.runInContext(functions, context);
  return {
    context, fields,
    input(id, value) {
      fields[`#${id}`].value = value;
      context.updateMaterialUnitPrice({ target: fields[`#${id}`] });
    },
    reopen(record) { context.state.materials = [record]; context.fillMaterialForm(record.code); },
    save() {
      context.saveMaterial({ preventDefault() {} });
      const record = JSON.parse(saved.get('synthetic')).materials[0];
      const reloaded = context.migrateMaterial(record);
      context.state.materials = [reloaded];
      return reloaded;
    }
  };
}

function assertCosts(context, record, unitPrice) {
  assert.equal(context.calcUnitPrice(record), unitPrice);
  const line = { materialCode: record.code, qty: 100, loss: 0 };
  assert.ok(Math.abs(context.calcLine(line).cost - unitPrice / 10) < 1e-10);
  const rows = context.recipeMaterialExportRows({ name: 'Test', lines: [line], components: [] }, [record]);
  assert.equal(rows[1][10], Number(unitPrice.toFixed(2)));
  assert.equal(rows[1][11], Number((unitPrice / 10).toFixed(4)));
}

test('new manual unit price survives save, reload, BOM and export with blank package price', () => {
  const f = form({ matSpec: '1', matUnitPrice: '100' });
  const record = f.save();
  assert.equal(record.unitPrice, 100);
  assert.equal(record.packagePrice, null);
  assertCosts(f.context, record, 100);
});

test('editing an affected record restores its manually entered price', () => {
  const f = form({ matSpec: '1', matPackagePrice: '0' }, { code: 'TEST-PRICE', unitPrice: 0 });
  f.input('matUnitPrice', '100');
  const record = f.save();
  assert.equal(record.unitPrice, 100);
  assert.equal(f.context.state.materials.length, 1);
  assertCosts(f.context, record, 100);
});

test('entering the specification after a manual price does not clear that price', () => {
  const f = form();
  f.input('matUnitPrice', '100');
  f.input('matSpec', '1');
  assert.equal(Number(f.fields['#matUnitPrice'].value), 100);
  assertCosts(f.context, f.save(), 100);
});

test('package price still derives the full precision cost', () => {
  const f = form({ matSpec: '3' });
  f.input('matPackagePrice', '100');
  const record = f.save();
  assert.equal(record.unitPrice, 100 / 3);
  assertCosts(f.context, record, 100 / 3);
});

test('the last edited price drives consistent package and unit prices', () => {
  const f = form({ matSpec: '1' });
  f.input('matPackagePrice', '80');
  f.input('matUnitPrice', '100');
  assert.equal(Number(f.fields['#matPackagePrice'].value), 100);
  assertCosts(f.context, f.save(), 100);
  f.input('matPackagePrice', '120');
  assertCosts(f.context, f.save(), 120);
});

test('blank prices remain distinguishable from an explicit zero', () => {
  const blank = form({ matSpec: '1' }).save();
  assert.equal(blank.packagePrice, null);
  assert.equal(blank.unitPrice, null);
  const zero = form({ matSpec: '1' });
  zero.input('matPackagePrice', '0');
  const record = zero.save();
  assert.equal(record.packagePrice, 0);
  assertCosts(zero.context, record, 0);
});

test('a low manual price and a 25 kg package retain their explicitly entered units on reload', () => {
  const f = form({ matSpec: '25' });
  f.input('matUnitPrice', '1.25');
  const record = f.save();
  assert.equal(record.spec, 25);
  assert.equal(record.unitPrice, 1.25);
  assertCosts(f.context, record, 1.25);
});

test('legacy package-priced records still calculate as before', () => {
  const f = form();
  assert.equal(f.context.calcUnitPrice({ spec: 0.5, packagePrice: 20, unitPrice: 40 }), 40);
});

test('a saved package price is retained when its specification is added later', () => {
  const f = form();
  f.input('matPackagePrice', '80');
  const partial = f.save();
  assert.equal(partial.packagePrice, 80);
  f.reopen(partial);
  f.input('matSpec', '1');
  assert.equal(Number(f.fields['#matPackagePrice'].value), 80);
  assertCosts(f.context, f.save(), 80);
});
