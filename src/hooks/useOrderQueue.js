/*  */"use client";

import { useState, useEffect, useCallback } from "react";
import useSSE from "@/hooks/useSSE";

/**
 * useOrderQueue — maintains the real-time order queue for the Warehouse page.
 *
 * - Fetches initial queue (orders with status `waiting_preparation` or `preparing`)
 *   from GET /api/orders on mount.
 * - Subscribes to SSE events:
 *     - `new_order`   → prepend the new order to the queue
 *     - `order_ready` → remove the order from the queue (it's been marked ready)
 *
 * @returns {{
 *   orders: Object[],
 *   isLoading: boolean,
 *   error: string | null,
 *   markReady: (orderId: string) => Promise<void>,
 *   refresh: () => Promise<void>,
 * }}
 */
export default function useOrderQueue(onNewOrder) {
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  /** Fetch the current queue from the API */
  const fetchQueue = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(
        "/api/orders?status=waiting_preparation,preparing,ready,shipping"
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || "Gagal memuat antrean");
      }
      // Sort oldest first so the queue is FIFO
      const sorted = (json.data || []).sort(
        (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
      );
      setOrders(sorted);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch on mount
  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  /** Handle incoming SSE events */
  const handleEvent = useCallback((event) => {
    if (event.type === "new_order") {
      const newOrder = event.data;
      setOrders((prev) => {
        // Avoid duplicates (e.g. if the page was refreshed mid-flight)
        if (prev.some((o) => o._id === newOrder._id)) return prev;
        return [...prev, newOrder];
      });
      // Panggil callback notifikasi di luar setOrders agar tidak stale
      if (onNewOrder) onNewOrder(newOrder);
    }

    if (event.type === "order_status_updated") {
      const { orderId, orderStatus } = event.data;
      // Remove from queue if status is completed or cancelled
      if (["completed", "cancelled"].includes(orderStatus)) {
        setOrders((prev) => prev.filter((o) => o._id !== orderId));
      } else {
        // Update status in place (e.g. waiting_preparation → preparing → ready → shipping)
        setOrders((prev) =>
          prev.map((o) =>
            o._id === orderId ? { ...o, orderStatus } : o
          )
        );
      }
    }
  }, [onNewOrder]); // ← tambahkan onNewOrder sebagai dependency

  useSSE(handleEvent);

  /**
   * Mark an order as ready (PATCH /api/orders/:id/status).
   * Updates status in place — order tetap di queue sampai selesai/dikirim.
   *
   * @param {string} orderId
   */
  const markReady = useCallback(async (orderId) => {
    // Optimistic update — ubah status di tempat
    setOrders((prev) =>
      prev.map((o) => (o._id === orderId ? { ...o, orderStatus: "ready" } : o))
    );

    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderStatus: "ready" }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error?.message || "Gagal memperbarui status");
      }
    } catch (err) {
      // Revert optimistic update on failure
      setError(err.message);
      await fetchQueue();
    }
  }, [fetchQueue]);

  return { orders, isLoading, error, markReady, refresh: fetchQueue };
}
