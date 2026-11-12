import { Schema, model, models } from "mongoose";

const searchRateLimitSchema = new Schema({
  _id: { type: String, required: true },
  count: { type: Number, required: true },
  expiresAt: { type: Date, required: true, expires: 0 },
}, { versionKey: false });

export default models.SearchRateLimit || model("SearchRateLimit", searchRateLimitSchema);
