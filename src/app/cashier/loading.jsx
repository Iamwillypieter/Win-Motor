/**
 * Loading skeleton for the /cashier route segment.
 * Shown by Next.js App Router while the page is streaming.
 */
export default function CashierLoading() {
  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header skeleton */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-5 w-32 rounded bg-gray-200 animate-pulse" />
            <div className="h-3 w-48 rounded bg-gray-100 animate-pulse" />
          </div>
          <div className="h-3 w-24 rounded bg-gray-100 animate-pulse" />
        </div>
      </div>

      {/* Content skeleton */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex gap-6 items-start">
          {/* Catalog skeleton */}
          <div className="flex-1 min-w-0">
            <div className="h-4 w-28 rounded bg-gray-200 animate-pulse mb-4" />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-gray-200 bg-white p-3 space-y-2"
                >
                  <div className="aspect-square rounded-lg bg-gray-100 animate-pulse" />
                  <div className="h-3 w-3/4 rounded bg-gray-200 animate-pulse" />
                  <div className="h-3 w-1/2 rounded bg-gray-100 animate-pulse" />
                </div>
              ))}
            </div>
          </div>

          {/* Cart skeleton */}
          <div className="w-80 flex-shrink-0">
            <div className="h-4 w-24 rounded bg-gray-200 animate-pulse mb-4" />
            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
              <div className="h-4 w-full rounded bg-gray-100 animate-pulse" />
              <div className="h-4 w-3/4 rounded bg-gray-100 animate-pulse" />
              <div className="h-10 w-full rounded-lg bg-gray-200 animate-pulse mt-4" />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
