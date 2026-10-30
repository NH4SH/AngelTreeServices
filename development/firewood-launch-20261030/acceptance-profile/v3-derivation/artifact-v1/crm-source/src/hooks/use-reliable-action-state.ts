"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

type Action<State, Payload> = (previousState: State, payload: Payload) => Promise<State>;

/**
 * Keeps form controls recoverable when a completed React action transition fails
 * to publish its final pending state. The ref guard also blocks queued duplicate
 * submissions before the disabled button has had a chance to render.
 */
export function useReliableActionState<State, Payload>(
  action: Action<State, Payload>,
  initialState: State,
): [State, (payload: Payload) => Promise<void>, boolean] {
  const [state, setState] = useState(initialState);
  const [pending, setPending] = useState(false);
  const actionRef = useRef(action);
  const stateRef = useRef(state);
  const pendingRef = useRef(false);
  const mountedRef = useRef(true);

  actionRef.current = action;
  stateRef.current = state;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const dispatch = useCallback(async (payload: Payload) => {
    if (pendingRef.current) return;

    pendingRef.current = true;
    setPending(true);

    let submitted = false;
    try {
      let prepared = payload;
      if (payload instanceof FormData && [...payload.values()].some(value => value instanceof File && value.size > 0)) {
        const { stageFormUploads } = await import("@/lib/files/stage-browser-upload");
        prepared = await stageFormUploads(payload) as Payload;
      }
      submitted = true;
      const nextState = await actionRef.current(stateRef.current, prepared);

      // Redirecting server actions may finish without a state payload while the
      // destination is loading. Keep the current state until navigation unmounts.
      if (nextState !== undefined && mountedRef.current) {
        flushSync(() => {
          stateRef.current = nextState;
          setState(nextState);
        });
      }
    } catch (error) {
      if (isNextNavigationSignal(error)) {
        throw error;
      }

      const failureState = toFailureState(stateRef.current, submitted);
      if (!failureState || !mountedRef.current) {
        throw error;
      }

      flushSync(() => {
        stateRef.current = failureState;
        setState(failureState);
      });
    } finally {
      pendingRef.current = false;

      if (mountedRef.current) {
        flushSync(() => setPending(false));
      }
    }
  }, []);

  return [state, dispatch, pending];
}

function toFailureState<State>(currentState: State, submitted = true): State | null {
  if (!currentState || typeof currentState !== "object" || !("status" in currentState) || !("message" in currentState)) {
    return null;
  }

  return {
    ...currentState,
    status: "error",
    message: submitted ? "That action could not finish. Please try again. Your previous click may already have been saved."
      : "The file transfer did not finish. Your form has not been submitted. Check the file and your connection, then try again.",
  } as State;
}

function isNextNavigationSignal(error: unknown) {
  if (!error || typeof error !== "object" || !("digest" in error)) {
    return false;
  }

  const digest = String(error.digest);
  return digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK");
}
