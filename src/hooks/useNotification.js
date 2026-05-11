"use client";

import { useState, useCallback, useRef } from "react";
import { playNotificationSound } from "@/components/shared/SoundNotification";

let toastCounter = 0;

/**
 * useNotification — hook untuk mengelola toast notifications dengan suara.
 *
 * @returns {{
 *   toasts: Array,
 *   notify: (type: string, title: string, message: string) => void,
 *   dismiss: (id: number) => void
 * }}
 */
export default function useNotification() {
  const [toasts, setToasts] = useState([]);

  const notify = useCallback((type, title, message) => {
    const id = ++toastCounter;
    setToasts((prev) => [...prev.slice(-4), { id, type, title, message }]); // max 5 toasts
    playNotificationSound(type);
  }, []);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, notify, dismiss };
}
