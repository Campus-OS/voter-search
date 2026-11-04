const { Voter } = require('../models');

async function markVoterVoted({ key, datasetId }) {
  // The supplied voter schema uses numeric _id values. Convert numeric keys back
  // before querying because MongoDB does not equate the number 1 with the string "1".
  const mongoId = /^\d+$/.test(key) ? Number(key) : key;
  const voterFilter = { _id: mongoId, dataset_id: datasetId, voted: { $ne: true } };
  const voter = await Voter.findOneAndUpdate(
    voterFilter,
    { $set: { voted: true, voted_at: new Date() } },
    { new: true, projection: { _id: 1 } },
  ).lean();

  if (voter) return { status: 'marked' };

  const existing = await Voter.exists({ _id: mongoId, dataset_id: datasetId });
  return existing ? { status: 'already_voted' } : { status: 'not_found' };
}

module.exports = { markVoterVoted };
