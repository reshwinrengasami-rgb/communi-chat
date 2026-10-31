import { connectToDatabase } from "@/lib/mongodb";
import Settings from "@/models/Settings";
import User from "@/models/User";

export type ClerkProfile = {
  id: string;
  emailAddresses?: Array<{ emailAddress: string }>;
  primaryEmailAddressId?: string | null;
  email_addresses?: Array<{ id?: string; email_address: string }>;
  primary_email_address_id?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  imageUrl?: string;
  image_url?: string;
};

export async function syncClerkUser(profile: ClerkProfile) {
  const primaryEmailId =
    profile.primaryEmailAddressId ?? profile.primary_email_address_id;
  const primaryEmail =
    profile.emailAddresses?.find(
      (email) => email.emailAddress && email.emailAddress.trim(),
    )?.emailAddress ??
    profile.email_addresses?.find(
      (email) =>
        email.id === primaryEmailId &&
        email.email_address &&
        email.email_address.trim(),
    )?.email_address ??
    profile.email_addresses?.find(
      (email) => email.email_address && email.email_address.trim(),
    )?.email_address ??
    "";

  if (!primaryEmail) {
    throw new Error(`Clerk user ${profile.id} does not have an email address`);
  }

  const fullName = [
    profile.firstName ?? profile.first_name,
    profile.lastName ?? profile.last_name,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  await connectToDatabase();
  const user = await User.findOneAndUpdate(
    { clerkId: profile.id },
    {
      $set: {
        email: primaryEmail,
        name: fullName || profile.username || primaryEmail,
        imageUrl: profile.imageUrl ?? profile.image_url ?? "",
        username: profile.username ?? "",
      },
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );

  await Settings.updateOne(
    { userId: profile.id },
    { $setOnInsert: { userId: profile.id } },
    { upsert: true },
  );

  return user;
}
