const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const rawKeysPath = path.resolve(process.cwd(), '.device-access-keys.generated.json');
const hashesPath = path.resolve(process.cwd(), '.device-access-key-hashes.json');
const rotate = process.argv.includes('--rotate');

if (!rotate && (fs.existsSync(rawKeysPath) || fs.existsSync(hashesPath))) {
  console.error('Access-key files already exist. Back them up, then rerun with --rotate to replace them.');
  process.exit(1);
}

const keys = Array.from({ length: 10 }, (_, index) => {
  const key = crypto.randomBytes(24).toString('base64url');
  return { label: `User ${String(index + 1).padStart(2, '0')}`, key };
});
const hashes = keys.map(({ label, key }) => ({
  label,
  key_hash: crypto.createHash('sha256').update(key, 'utf8').digest('hex'),
}));

for (const [filePath, value] of [[rawKeysPath, keys], [hashesPath, hashes]]) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: rotate ? 'w' : 'wx' });
  fs.chmodSync(filePath, 0o600);
}

console.info('Generated 10 unique 32-character device keys.');
console.info(`Distribute the secrets in: ${path.basename(rawKeysPath)}`);
console.info(`The server reads key hashes from: ${path.basename(hashesPath)}`);
console.info('Do not commit either file. Each secret is bound to the first browser device that uses it.');
