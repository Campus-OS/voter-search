const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { DeviceAccessKey } = require('../models');
const config = require('../config');

function readDeviceAccessSeeds() {
  const filePath = path.resolve(process.cwd(), config.DEVICE_ACCESS_KEYS_FILE);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT' && config.NODE_ENV !== 'production') return [];
    throw new Error(`Unable to load device access-key hash file: ${error.message}`);
  }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 10) {
    throw new Error('Device access-key hash file must contain between 1 and 10 keys.');
  }
  const seen = new Set();
  return parsed.map((entry, index) => {
    if (!entry || typeof entry.label !== 'string' || !entry.label.trim() || !/^[a-f\d]{64}$/i.test(entry.key_hash || '')) {
      throw new Error(`Invalid device access-key entry at position ${index + 1}.`);
    }
    const keyHash = entry.key_hash.toLowerCase();
    if (seen.has(keyHash)) throw new Error('Device access-key hashes must be unique.');
    seen.add(keyHash);
    return { label: entry.label.trim().slice(0, 60), key_hash: keyHash };
  });
}

async function seedDeviceAccessKeys() {
  const seeds = readDeviceAccessSeeds();
  if (!seeds.length) {
    if (config.NODE_ENV === 'production') throw new Error('Production requires 1–10 device access keys. Generate keys before starting the server.');
    return 0;
  }
  await DeviceAccessKey.createIndexes();
  const activeHashes = seeds.map(({ key_hash }) => key_hash);
  await DeviceAccessKey.updateMany({ key_hash: { $nin: activeHashes } }, { $set: { active: false } });
  await DeviceAccessKey.bulkWrite(seeds.map(({ label, key_hash }) => ({
    updateOne: {
      filter: { key_hash },
      update: {
        $set: { label, active: true },
        $setOnInsert: { device_id: null },
      },
      upsert: true,
    },
  })));
  return seeds.length;
}

function hashAccessKey(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

async function bindAccessKeyToDevice(key, deviceId) {
  const keyHash = hashAccessKey(key);
  try {
    const bound = await DeviceAccessKey.findOneAndUpdate(
      {
        key_hash: keyHash,
        active: true,
        $or: [{ device_id: null }, { device_id: { $exists: false } }, { device_id: deviceId }],
      },
      { $set: { device_id: deviceId, last_used_at: new Date() } },
      { new: true, projection: { _id: 1 } },
    ).lean();
    if (bound) return { status: 'authorized' };

    const existing = await DeviceAccessKey.findOne({ key_hash: keyHash, active: true }).select('device_id').lean();
    if (!existing) return { status: 'invalid_key' };
    if (existing.device_id && existing.device_id !== deviceId) return { status: 'device_mismatch' };
    return { status: 'device_already_registered' };
  } catch (error) {
    if (error.code === 11000) return { status: 'device_already_registered' };
    throw error;
  }
}

module.exports = { bindAccessKeyToDevice, hashAccessKey, readDeviceAccessSeeds, seedDeviceAccessKeys };
