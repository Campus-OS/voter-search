const { t } = require('@indic-transliteration/sanscript');

function transliterateNameToDevanagari(value) {
  const query = value.normalize('NFKC').trim();
  if (!/[\p{Script=Latin}]/u.test(query) || /[^\p{Script=Latin}\p{M}\s.'’-]/u.test(query)) return query;

  try {
    return t(query.toLocaleLowerCase(), 'itrans', 'devanagari').replace(/्(?=\s|$)/gu, '');
  } catch {
    // Keep search available with the original query if an unexpected character cannot transliterate.
    return query;
  }
}

module.exports = { transliterateNameToDevanagari };
