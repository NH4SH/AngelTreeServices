"use client";

import type { ReactNode } from "react";
import { signOut } from "@/app/login/actions";
import { clearBrowserDrafts } from "@/lib/drafts/browser-privacy";

export function SignOutForm({ children }: { children: ReactNode }) {
  return <form action={signOut} onSubmit={clearBrowserDrafts}>{children}</form>;
}
