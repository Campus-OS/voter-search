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
