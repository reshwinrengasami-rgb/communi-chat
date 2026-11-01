import { Schema, model, models, type InferSchemaType } from "mongoose";

const pushSubscriptionSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
  },
  { timestamps: true },
);

export type PushSubscriptionDocument = InferSchemaType<
  typeof pushSubscriptionSchema
>;
const PushSubscription =
  models.PushSubscription ||
  model("PushSubscription", pushSubscriptionSchema);

export default PushSubscription;
