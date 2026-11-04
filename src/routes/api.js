const crypto = require('node:crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const config = require('../config');
const { searchVoters } = require('../services/search');
const { bindAccessKeyToDevice } = require('../services/device-access');
const { markVoterVoted } = require('../services/voting');

const router = express.Router();
const searchLimiter = rateLimit({ windowMs: 60_000, limit: config.SEARCH_RATE_LIMIT, standardHeaders: 'draft-8', legacyHeaders: false });
const voteLimiter = rateLimit({ windowMs: 60_000, limit: config.VOTE_RATE_LIMIT, standardHeaders: 'draft-8', legacyHeaders: false });
const searchSchema = z.object({
  type: z.enum(['name', 'house', 'epic']),
  q: z.string().trim().min(1).max(80),
  datasetId: z.coerce.number().int().positive().default(config.DEFAULT_DATASET_ID),
});
const voteSchema = z.object({
  datasetId: z.coerce.number().int().positive().default(config.DEFAULT_DATASET_ID),
});

function requireVoteKey(req, res, next) {
  const configuredKey = config.VOTE_API_KEY;
  const providedKey = req.get('x-vote-key') || '';
  if (!configuredKey) {
    return res.status(503).json({ error: 'Vote marking is not configured. Set VOTE_API_KEY on the server.' });
  }
  const provided = Buffer.from(providedKey);
  const expected = Buffer.from(configuredKey);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return res.status(401).json({ error: 'A valid operator key is required to mark a voter.' });
  }
  return next();
}

async function requireAccessKey(req, res, next) {
  if (!req.app.locals.deviceAccessEnabled) {
    if (config.NODE_ENV === 'production') {
      return res.status(503).json({ error: 'Device access keys are not configured on the server.' });
    }
    return next();
  }
  const key = req.get('x-access-key') || '';
  const deviceId = req.get('x-device-id') || '';
  if (!/^[A-Za-z0-9_-]{32}$/.test(key)) {
    return res.status(401).json({ error: 'Enter a valid 32-character device access key.' });
  }
  if (!/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(deviceId)) {
    return res.status(400).json({ error: 'This browser could not identify its device. Enable browser storage and try again.' });
  }
  try {
    const result = await bindAccessKeyToDevice(key, deviceId);
    if (result.status === 'invalid_key') return res.status(401).json({ error: 'This access key is invalid or disabled.' });
    if (result.status === 'device_mismatch') {
      return res.status(403).json({ error: 'This key is bound to another browser profile. A different IP address, hostname, or protocol creates a separate profile. Keep using the exact same site address or ask an administrator to reset the binding.' });
    }
    if (result.status === 'device_already_registered') return res.status(409).json({ error: 'This browser is already registered with a different key. Use the key originally registered in this browser.' });
    return next();
  } catch (error) {
    return next(error);
  }
}

router.get('/health', (req, res) => {
  const ready = req.app.locals.mongoReady === true;
  res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'starting' });
});

router.get('/search', searchLimiter, requireAccessKey, async (req, res, next) => {
  const parsed = searchSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Provide type (name, house, or epic), a search term, and a valid datasetId.' });
  }
  const { type, q, datasetId } = parsed.data;
  if ((type === 'name' && q.length < 2) || (type === 'epic' && q.length < 3)) {
    return res.status(400).json({ error: 'Enter at least 2 characters for a name or 3 for an EPIC number.' });
  }
  try {
    const voters = await searchVoters({ type, query: q, datasetId });
    return res.json({ results: voters, count: voters.length, limit: type === 'house' ? 100 : 50 });
  } catch (error) {
    return next(error);
  }
});

router.post('/voters/:key/voted', voteLimiter, requireVoteKey, async (req, res, next) => {
  const parsed = voteSchema.safeParse(req.body);
  const key = req.params.key;
  if (!parsed.success || !/^[a-zA-Z0-9_-]{1,80}$/.test(key)) {
    return res.status(400).json({ error: 'Invalid voter or dataset identifier.' });
  }
  try {
    const result = await markVoterVoted({ key, datasetId: parsed.data.datasetId });
    if (result.status === 'not_found') return res.status(404).json({ error: 'Voter record not found.' });
    if (result.status === 'already_voted') return res.status(409).json({ status: result.status, message: 'Already voted.' });
    return res.json({ status: result.status, message: 'Marked as already voted.' });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
