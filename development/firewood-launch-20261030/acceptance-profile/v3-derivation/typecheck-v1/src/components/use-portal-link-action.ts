"use client";

import { useCallback, useRef, useState } from "react";

type PortalLinkActionState = {
  ok: boolean;
  status: string;
  message: string;
};

const PORTAL_LINK_ACTION_TIMEOUT_MS = 30_000;

export function usePortalLinkAction<T extends PortalLinkActionState>(
  action: (previousState: T, formData: FormData) => Promise<T>,
  initialState: T,
) {
  const [state, setState] = useState<T>(initialState);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);

  const submit = useCallback(async (formData: FormData) => {
    if (pendingRef.current) {
      return;
    }

    pendingRef.current = true;
    setPending(true);

    try {
      const result = await Promise.race([
        action(state, formData),
        new Promise<T>((_, reject) => {
          window.setTimeout(() => reject(new Error("timeout")), PORTAL_LINK_ACTION_TIMEOUT_MS);
        }),
      ]);
      setState(result);
    } catch (error) {
      console.error("Customer portal link action failed", error);
      setState({
        ...initialState,
        ok: false,
        status: "error",
        message: "Could not generate customer link. Please try again.",
      });
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }, [action, initialState, state]);

  return { pending, state, submit };
}
