import { Schema, model, models, type InferSchemaType } from "mongoose";

const userSchema = new Schema(
  {
    clerkId: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    imageUrl: { type: String, default: "" },
    username: { type: String, default: "" },
    lastActiveAt: { type: Date },
  },
  { timestamps: true },
);

export type UserDocument = InferSchemaType<typeof userSchema>;
const User = models.User || model("User", userSchema);

export default User;
