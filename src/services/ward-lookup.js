const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

function getWardReference(voter) {
  const value = voter.ward_id ?? voter.wardId;
  if (value === undefined || value === null || value === '') return null;

  if (value && typeof value.toHexString === 'function') {
    const id = value.toHexString().toLowerCase();
    return { kind: 'objectId', value: id, key: `objectId:${id}` };
  }

  if (typeof value === 'string' && OBJECT_ID_PATTERN.test(value)) {
    const id = value.toLowerCase();
    return { kind: 'objectId', value: id, key: `objectId:${id}` };
  }

  const legacyId = Number(value);
  if (Number.isSafeInteger(legacyId) && legacyId > 0) {
    return { kind: 'legacy', value: legacyId, key: `legacy:${legacyId}` };
  }
  return null;
}

function buildWardQuery(voters, datasetId, ObjectId) {
  const references = voters.map(getWardReference).filter(Boolean);
  const objectIds = [...new Set(references.filter((ref) => ref.kind === 'objectId').map((ref) => ref.value))]
    .map((id) => new ObjectId(id));
  const legacyIds = [...new Set(references.filter((ref) => ref.kind === 'legacy').map((ref) => ref.value))];
  const clauses = [];
  if (objectIds.length) clauses.push({ _id: { $in: objectIds } });
  if (legacyIds.length) clauses.push({ dataset_id: datasetId, id: { $in: legacyIds } });
  return clauses.length ? { $or: clauses } : null;
}

function createWardMap(wards) {
  const map = new Map();
  for (const ward of wards) {
    if (ward._id && typeof ward._id.toString === 'function') {
      map.set(`objectId:${ward._id.toString().toLowerCase()}`, ward);
    }
    const legacyId = Number(ward.id);
    if (Number.isSafeInteger(legacyId) && legacyId > 0) {
      map.set(`legacy:${legacyId}`, ward);
    }
  }
  return map;
}

module.exports = { buildWardQuery, createWardMap, getWardReference };
