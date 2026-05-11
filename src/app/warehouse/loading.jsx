/**
 * Loading skeleton for the /warehouse route segment.
 */
export default function WarehouseLoading() {
  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header skeleton */}
        <div className="mb-6 space-y-2">
          <div className="h-7 w-48 rounded bg-gray-200 animate-pulse" />
          <div className="h-4 w-72 rounded bg-gray-100 animate-pulse" />
        </div>

        {/* Content skeleton — cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-gray-200 bg-white p-5 space-y-3"
            >
              <div className="flex justify-between">
                <div className="h-4 w-32 rounded bg-gray-200 animate-pulse" />
                <div className="h-4 w-20 rounded bg-gray-100 animate-pulse" />
              </div>
              <div className="space-y-2">
                <div className="h-3 w-full rounded bg-gray-100 animate-pulse" />
                <div className="h-3 w-3/4 rounded bg-gray-100 animate-pulse" />
              </div>
              <div className="h-9 w-full rounded-lg bg-gray-200 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
