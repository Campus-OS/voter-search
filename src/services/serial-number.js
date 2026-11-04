function serialNumberFromRowText(rowText) {
  if (rowText === undefined || rowText === null) return null;
  const text = String(rowText).trim();
  if (/^\d{4}$/.test(text)) return text;
  const match = text.match(/(?:^|\D)(\d{4})(?!\d)/);
  return match ? match[1] : null;
}

function resolveSerialNumber(serialNo, rowText) {
  return serialNumberFromRowText(rowText) || serialNo || null;
}

module.exports = { resolveSerialNumber, serialNumberFromRowText };
