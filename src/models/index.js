const mongoose = require('mongoose');
const config = require('../config');

const { Schema } = mongoose;

// Mixed _id supports imported voter documents whose IDs are numeric rather than ObjectIds.
const voterSchema = new Schema({
  _id: { type: Schema.Types.Mixed },
  dataset_id: Number,
  ward_id: Schema.Types.Mixed,
  wardId: Schema.Types.Mixed,
  epic_no: String,
  name: String,
  relation_type: String,
  relation_name: String,
  house_no: String,
  age: Number,
  gender: String,
  part_no: Schema.Types.Mixed,
  serial_no: String,
  row_text: Schema.Types.Mixed,
  record_status: String,
  review_status: String,
  source_page: Number,
  raw_ocr_text: String,
  voted: Boolean,
  voted_at: Date,
}, { strict: false, collection: config.VOTERS_COLLECTION });

voterSchema.index({ dataset_id: 1, name: 1 });
voterSchema.index({ dataset_id: 1, house_no: 1 });
voterSchema.index({ dataset_id: 1, epic_no: 1 });

const wardSchema = new Schema({
  dataset_id: Number,
  id: Number,
  booth_no: Number,
  name: String,
  village_name: String,
  ward_no: Number,
  contact_person: String,
  notes: String,
}, { strict: false, collection: config.WARD_COLLECTION });

wardSchema.index({ dataset_id: 1, id: 1 });

const deviceAccessKeySchema = new Schema({
  label: { type: String, required: true, trim: true },
  key_hash: { type: String, required: true, unique: true },
  device_id: { type: String, default: null },
  active: { type: Boolean, default: true },
  last_used_at: { type: Date, default: null },
}, { collection: 'device_access_keys', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

deviceAccessKeySchema.index({ device_id: 1 }, {
  unique: true,
  partialFilterExpression: { device_id: { $type: 'string' } },
});

module.exports = {
  Voter: mongoose.model('Voter', voterSchema),
  Ward: mongoose.model('Ward', wardSchema),
  DeviceAccessKey: mongoose.model('DeviceAccessKey', deviceAccessKeySchema),
};
