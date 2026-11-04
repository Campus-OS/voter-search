function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizedCharacters(value, compact = false) {
  const normalized = value.normalize('NFKC').toLocaleLowerCase();
  return Array.from(compact ? normalized.replace(/[^\p{L}\p{N}]/gu, '') : normalized);
}

function buildFuzzyPatterns(value, compact = false) {
  const characters = normalizedCharacters(value, compact);
  const literal = (character) => escapeRegex(character);
  const patterns = new Set([characters.map(literal).join('')]);

  // One edit catches the common typo, missing-letter, and extra-letter cases.
  // Keep two-character name lookups exact to avoid an excessively broad match.
  if (characters.length < 3) return [...patterns];

  for (let index = 0; index < characters.length; index += 1) {
    patterns.add(characters.map((character, position) => (position === index ? '.' : literal(character))).join(''));
    patterns.add(characters.filter((_, position) => position !== index).map(literal).join(''));

    const withExtraCharacter = [...characters];
    withExtraCharacter.splice(index, 0, '.?');
    patterns.add(withExtraCharacter.map((character) => character === '.?' ? '.?' : literal(character)).join(''));
  }
  const withTrailingCharacter = [...characters, '.?'];
  patterns.add(withTrailingCharacter.map((character) => character === '.?' ? '.?' : literal(character)).join(''));

  if (compact) {
    const separator = '(?:[^A-Za-z0-9]*)';
    return [...patterns].map((pattern) => {
      // Fuzzy wildcards stay intact; separators are accepted between EPIC characters.
      const units = pattern.match(/\.\?|\.|\\.|./gu) || [];
      return units.map((unit) => `${unit}${separator}`).join('');
    });
  }
  return [...patterns];
}

function editDistance(left, right) {
  const a = Array.from(left);
  const b = Array.from(right);
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= b.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

function approximateSubstringDistance(query, value, compact = false) {
  const needle = normalizedCharacters(query, compact);
  const haystack = normalizedCharacters(value, compact);
  if (!needle.length || !haystack.length) return Infinity;
  if (needle.length === 2) {
    for (let start = 0; start <= haystack.length - needle.length; start += 1) {
      if (haystack[start] === needle[0] && haystack[start + 1] === needle[1]) return 0;
    }
    return Infinity;
  }

  let best = Infinity;
  const maxDistance = 1;
  for (let length = Math.max(1, needle.length - maxDistance); length <= needle.length + maxDistance; length += 1) {
    for (let start = 0; start + length <= haystack.length; start += 1) {
      best = Math.min(best, editDistance(needle.join(''), haystack.slice(start, start + length).join('')));
      if (best === 0) return 0;
    }
  }
  return best;
}

function buildSearchFilter({ type, query, datasetId }) {
  const filter = { dataset_id: datasetId };
  if (type === 'house') filter.house_no = query;
  if (type === 'name' || type === 'epic') {
    const compact = type === 'epic';
    const field = compact ? 'epic_no' : 'name';
    const queries = [...new Set(Array.isArray(query) ? query : [query])];
    const patterns = [...new Set(queries.flatMap((item) => buildFuzzyPatterns(item, compact)))];
    filter.$or = patterns.map((pattern) => ({ [field]: { $regex: pattern, $options: 'i' } }));
  }
  return filter;
}

module.exports = {
  approximateSubstringDistance,
  buildFuzzyPatterns,
  buildSearchFilter,
  editDistance,
  escapeRegex,
  normalizedCharacters,
};
