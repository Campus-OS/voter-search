const { Voter, Master } = require('../models');
const { approximateSubstringDistance, buildSearchFilter, normalizedCharacters } = require('./search-query');
const { resolveSerialNumber } = require('./serial-number');
const { transliterateNameToDevanagari } = require('./transliteration');

const VOTER_FIELDS = [
  'dataset_id', 'ward_id', 'epic_no', 'name', 'relation_type', 'relation_name',
  'house_no', 'age', 'gender', 'part_no', 'serial_no', 'row_text', 'record_status',
  'review_status', 'source_page', 'raw_ocr_text', 'voted',
].join(' ');

function normalizedWardId(value) {
  if (value === undefined || value === null || value === '') return null;
  const wardId = Number(value);
  return Number.isSafeInteger(wardId) && wardId > 0 ? wardId : null;
}

async function searchVoters({ type, query, datasetId }) {
  const searchTerms = type === 'name'
    ? [...new Set([query, transliterateNameToDevanagari(query)])]
    : [query];
  const filter = buildSearchFilter({ type, query: type === 'name' ? searchTerms : query, datasetId });
  const limit = type === 'house' ? 100 : 50;
  let voters = await Voter.find(filter)
    .select(`_id ${VOTER_FIELDS}`)
    .limit(type === 'house' ? limit : 500)
    .lean();

  if (type === 'name' || type === 'epic') {
    const field = type === 'name' ? 'name' : 'epic_no';
    const compact = type === 'epic';
    const maxDistance = Math.max(...searchTerms.map((term) => normalizedCharacters(term, compact).length)) >= 3 ? 1 : 0;
    voters = voters
      .map((voter) => ({
        voter,
        distance: Math.min(...searchTerms.map((term) => approximateSubstringDistance(term, voter[field] || '', compact))),
      }))
      .filter(({ distance }) => distance <= maxDistance)
      .sort((left, right) => left.distance - right.distance)
      .slice(0, limit)
      .map(({ voter }) => voter);
  }
  const wardIds = [...new Set(voters.map((voter) => normalizedWardId(voter.ward_id)).filter((id) => id !== null))];
  const masters = wardIds.length
    ? await Master.find({ dataset_id: datasetId, id: { $in: wardIds } })
      .select('dataset_id id booth_no name village_name ward_no contact_person notes').lean()
    : [];
  const masterByWardId = new Map(masters
    .map((master) => [normalizedWardId(master.id), master])
    .filter(([id]) => id !== null)
    .map(([id, master]) => [String(id), master]));

  return voters.map((voter) => {
    const wardId = normalizedWardId(voter.ward_id);
    const master = wardId === null ? null : masterByWardId.get(String(wardId));
    return {
      key: String(voter._id),
      dataset_id: voter.dataset_id,
      ward_id: voter.ward_id,
      epic_no: voter.epic_no,
      name: voter.name,
      relation_type: voter.relation_type,
      relation_name: voter.relation_name,
      house_no: voter.house_no,
      age: voter.age,
      gender: voter.gender,
      part_no: voter.part_no,
      serial_no: resolveSerialNumber(voter.serial_no, voter.row_text),
      row_text: voter.row_text,
      record_status: voter.record_status,
      review_status: voter.review_status,
      source_page: voter.source_page,
      raw_ocr_text: voter.raw_ocr_text,
      already_voted: voter.voted === true,
      master: master ? {
        booth_no: master.booth_no,
        name: master.name,
        village_name: master.village_name,
        ward_no: master.ward_no,
        contact_person: master.contact_person,
        notes: master.notes,
      } : null,
    };
  });
}

module.exports = { searchVoters };
