import { Schema, model, models, type InferSchemaType } from "mongoose";

const settingsSchema = new Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    theme: { type: String, enum: ["dark", "light", "system"], default: "dark" },
    notifications: {
      messages: { type: Boolean, default: true },
      calls: { type: Boolean, default: true },
      mentions: { type: Boolean, default: true },
    },
    privacy: {
      showOnlineStatus: { type: Boolean, default: true },
      allowDirectMessages: { type: Boolean, default: true },
    },
    appearance: {
      type: new Schema({
        buttonSize: { type: String, enum: ["small", "normal", "large"], required: true },
        bubbleColor: { type: String, required: true },
        backgroundColor: { type: String, required: true },
        backgroundPhoto: { type: String, default: "" },
      }, { _id: false }),
      default: undefined,
    },
  },
  { timestamps: true },
);

export type SettingsDocument = InferSchemaType<typeof settingsSchema>;
const Settings =
  models.Settings || model("Settings", settingsSchema);

export default Settings;
