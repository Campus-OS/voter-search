const test = require('node:test');
const assert = require('node:assert/strict');
const {
  approximateSubstringDistance,
  buildFuzzyPatterns,
  buildSearchFilter,
  editDistance,
  escapeRegex,
} = require('../src/services/search-query');
const { transliterateNameToDevanagari } = require('../src/services/transliteration');
const { resolveSerialNumber, serialNumberFromRowText } = require('../src/services/serial-number');
const { buildWardQuery, createWardMap, getWardReference } = require('../src/services/ward-lookup');

test('name search is dataset scoped and regex metacharacters are escaped', () => {
  const filter = buildSearchFilter({ type: 'name', query: 'A.(B)', datasetId: 7 });
  assert.equal(filter.dataset_id, 7);
  assert.ok(filter.$or.some(({ name }) => new RegExp(name.$regex, name.$options).test('A.(B)')));
});

test('house number search matches the exact supplied house number', () => {
  assert.deepEqual(buildSearchFilter({ type: 'house', query: '04/A', datasetId: 1 }), {
    dataset_id: 1,
    house_no: '04/A',
  });
});

test('EPIC search tolerates separators and generates bounded typo patterns', () => {
  const filter = buildSearchFilter({ type: 'epic', query: 'RJ/109', datasetId: 1 });
  assert.equal(filter.dataset_id, 1);
  assert.ok(filter.$or.some(({ epic_no }) => new RegExp(epic_no.$regex, epic_no.$options).test('RJ/109')));
  assert.ok(filter.$or.some(({ epic_no }) => new RegExp(epic_no.$regex, epic_no.$options).test('RJ/119')));
});

test('regex escaping does not alter ordinary Unicode text', () => {
  assert.equal(escapeRegex('रेवन्ती'), 'रेवन्ती');
});

test('fuzzy name search tolerates a one-character typo and matches substrings', () => {
  assert.equal(approximateSubstringDistance('राम', 'रामदेव'), 0);
  assert.equal(approximateSubstringDistance('रेवन्ति', 'रेवन्ती'), 1);
  assert.equal(approximateSubstringDistance('राम', 'रम'), 1);
});

test('EPIC scoring ignores separators and supports one-character errors', () => {
  assert.equal(approximateSubstringDistance('RJ109', 'RJ/109', true), 0);
  assert.equal(approximateSubstringDistance('RJ109', 'RJ/119', true), 1);
  assert.ok(buildFuzzyPatterns('xka', true).length > 1);
});

test('edit distance works with Devanagari code points', () => {
  assert.equal(editDistance('रेवन्ति', 'रेवन्ती'), 1);
});

test('Roman-script names are transliterated locally and Hindi input is preserved', () => {
  assert.equal(transliterateNameToDevanagari('ramesh'), 'रमेश');
  assert.equal(transliterateNameToDevanagari('रेवन्ती'), 'रेवन्ती');
});

test('four-digit row_text is preferred as the serial number', () => {
  assert.equal(serialNumberFromRowText('0042'), '0042');
  assert.equal(serialNumberFromRowText('row 0042 voter'), '0042');
  assert.equal(serialNumberFromRowText('10042'), null);
  assert.equal(resolveSerialNumber('12', 'row 0042 voter'), '0042');
  assert.equal(resolveSerialNumber('12', ''), '12');
});

test('ward references support ObjectId strings and legacy numeric IDs', () => {
  assert.deepEqual(getWardReference({ ward_id: '6aeac13e3f585b7f5202b2ce' }), {
    kind: 'objectId', value: '6aeac13e3f585b7f5202b2ce', key: 'objectId:6aeac13e3f585b7f5202b2ce',
  });
  assert.deepEqual(getWardReference({ wardId: 12 }), { kind: 'legacy', value: 12, key: 'legacy:12' });
});

test('ward query joins ObjectIds directly and scopes legacy IDs to a dataset', () => {
  class FakeObjectId {
    constructor(value) { this.value = value; }
  }
  const query = buildWardQuery([
    { ward_id: '6aeac13e3f585b7f5202b2ce' },
    { ward_id: 12 },
  ], 3, FakeObjectId);
  assert.equal(query.$or[0]._id.$in[0].value, '6aeac13e3f585b7f5202b2ce');
  assert.deepEqual(query.$or[1], { dataset_id: 3, id: { $in: [12] } });
});

test('ward results map by MongoDB _id and legacy id', () => {
  const wards = createWardMap([
    { _id: { toString: () => '6aeac13e3f585b7f5202b2ce' }, name: 'Ward by ObjectId' },
    { _id: { toString: () => '6aeac13e3f585b7f5202b2cf' }, id: 12, name: 'Legacy ward' },
  ]);
  assert.equal(wards.get('objectId:6aeac13e3f585b7f5202b2ce').name, 'Ward by ObjectId');
  assert.equal(wards.get('legacy:12').name, 'Legacy ward');
});
