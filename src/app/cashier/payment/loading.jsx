/**
 * Loading skeleton for the /cashier/payment/[orderId] route segment.
 */
export default function PaymentLoading() {
  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header skeleton */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-5 w-28 rounded bg-gray-200 animate-pulse" />
            <div className="h-3 w-44 rounded bg-gray-100 animate-pulse" />
          </div>
          <div className="h-3 w-24 rounded bg-gray-100 animate-pulse" />
        </div>
      </div>

      {/* Payment modal skeleton */}
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-lg mx-auto space-y-4">
          <div className="h-5 w-48 rounded bg-gray-200 animate-pulse" />
          <div className="h-3 w-32 rounded bg-gray-100 animate-pulse" />

          {/* Items skeleton */}
          <div className="rounded-lg bg-gray-50 p-4 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <div className="h-3 w-40 rounded bg-gray-200 animate-pulse" />
                <div className="h-3 w-20 rounded bg-gray-200 animate-pulse" />
              </div>
            ))}
            <div className="border-t border-gray-200 pt-2 flex justify-between">
              <div className="h-4 w-12 rounded bg-gray-200 animate-pulse" />
              <div className="h-4 w-24 rounded bg-gray-200 animate-pulse" />
            </div>
          </div>

          {/* Tab skeleton */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <div className="flex-1 h-10 bg-gray-200 animate-pulse" />
            <div className="flex-1 h-10 bg-gray-100 animate-pulse" />
          </div>

          {/* Input skeleton */}
          <div className="h-10 w-full rounded-lg bg-gray-100 animate-pulse" />
          <div className="h-11 w-full rounded-lg bg-gray-200 animate-pulse" />
        </div>
      </div>
    </main>
  );
}
