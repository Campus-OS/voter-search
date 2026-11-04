const mongoose = require('mongoose');
const { Voter, Ward } = require('../models');
const { approximateSubstringDistance, buildSearchFilter, normalizedCharacters } = require('./search-query');
const { resolveSerialNumber } = require('./serial-number');
const { transliterateNameToDevanagari } = require('./transliteration');
const { buildWardQuery, createWardMap, getWardReference } = require('./ward-lookup');

const VOTER_FIELDS = [
  'dataset_id', 'ward_id', 'wardId', 'epic_no', 'name', 'relation_type', 'relation_name',
  'house_no', 'age', 'gender', 'part_no', 'serial_no', 'row_text', 'record_status',
  'review_status', 'source_page', 'raw_ocr_text', 'voted',
].join(' ');

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
  const wardQuery = buildWardQuery(voters, datasetId, mongoose.Types.ObjectId);
  const wards = wardQuery
    ? await Ward.find(wardQuery)
      .select('_id dataset_id id booth_no name village_name ward_no contact_person notes').lean()
    : [];
  const wardByReference = createWardMap(wards);

  return voters.map((voter) => {
    const wardReference = getWardReference(voter);
    const wardDocument = wardReference ? wardByReference.get(wardReference.key) : null;
    const wardDetails = wardDocument ? {
      booth_no: wardDocument.booth_no,
      name: wardDocument.name,
      village_name: wardDocument.village_name,
      ward_no: wardDocument.ward_no,
      contact_person: wardDocument.contact_person,
      notes: wardDocument.notes,
    } : null;
    return {
      key: String(voter._id),
      dataset_id: voter.dataset_id,
      ward_id: voter.ward_id ?? voter.wardId,
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
      ward: wardDetails,
    };
  });
}

module.exports = { searchVoters };
