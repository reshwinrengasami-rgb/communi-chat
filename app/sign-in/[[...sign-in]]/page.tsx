import { RedirectToSignIn } from "@clerk/nextjs";
import { Suspense } from "react";

export default function SignInPage() {
  return (
    <Suspense>
      <RedirectToSignIn />
    </Suspense>
  );
}
