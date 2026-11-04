const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const generatorPath = path.resolve(__dirname, '../scripts/generate-device-access-keys.js');

test('key generator writes ten unique 32-character keys and matching hashes securely', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'voter-search-keys-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const result = spawnSync(process.execPath, [generatorPath], { cwd: directory, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const keyPath = path.join(directory, '.device-access-keys.generated.json');
  const hashPath = path.join(directory, '.device-access-key-hashes.json');
  const keys = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  const hashes = JSON.parse(fs.readFileSync(hashPath, 'utf8'));

  assert.equal(keys.length, 10);
  assert.equal(hashes.length, 10);
  assert.equal(new Set(keys.map((entry) => entry.key)).size, 10);
  keys.forEach((entry, index) => {
    assert.match(entry.key, /^[A-Za-z0-9_-]{32}$/);
    assert.equal(hashes[index].label, entry.label);
    assert.equal(hashes[index].key_hash, crypto.createHash('sha256').update(entry.key).digest('hex'));
  });
  assert.equal(fs.statSync(keyPath).mode & 0o777, 0o600);
});
