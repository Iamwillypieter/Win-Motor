"use client";

import { useEffect, useRef } from "react";

/**
 * useSSE — subscribes to the /api/sse endpoint and calls `onEvent` for each
 * received message.
 *
 * The EventSource is automatically closed when the component unmounts.
 *
 * @param {(event: { type: string, data: unknown }) => void} onEvent
 *   Callback invoked with the parsed JSON payload of each SSE message.
 */
export default function useSSE(onEvent) {
  // Keep a stable ref to the callback so we don't need to re-subscribe
  // when the parent re-renders with a new function reference.
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    // EventSource is only available in the browser
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      return;
    }

    const es = new EventSource("/api/sse");

    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);

        // Handle force logout dari owner
        if (parsed.type === "force_logout") {
          es.close();
          // Gunakan next-auth signOut via redirect
          import("next-auth/react").then(({ signOut }) => {
            signOut({ callbackUrl: "/login" });
          });
          return;
        }

        onEventRef.current(parsed);
      } catch (err) {
        console.error("useSSE: failed to parse event data", err);
      }
    };

    es.onerror = (err) => {
      console.error("useSSE: EventSource error", err);
      // EventSource will automatically attempt to reconnect on error.
    };

    // Cleanup: close the connection when the component unmounts
    return () => {
      es.close();
    };
  }, []); // Empty deps — connect once on mount, disconnect on unmount
}
