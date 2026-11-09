import { Schema, model, models } from "mongoose";

const firebasePushTokenSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    token: { type: String, required: true, unique: true },
  },
  { timestamps: true },
);

export default models.FirebasePushToken ||
  model("FirebasePushToken", firebasePushTokenSchema);
