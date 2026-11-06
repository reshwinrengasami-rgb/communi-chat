import { RedirectToSignUp } from "@clerk/nextjs";
import { Suspense } from "react";

export default function SignUpPage() {
  return (
    <Suspense>
      <RedirectToSignUp />
    </Suspense>
  );
}
