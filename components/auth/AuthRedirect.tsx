"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function AuthRedirect({ to }: { to: "/login" | "/waiting-for-approval" }) {
  const router = useRouter();

  useEffect(() => {
    router.replace(to);
  }, [router, to]);

  return null;
}
