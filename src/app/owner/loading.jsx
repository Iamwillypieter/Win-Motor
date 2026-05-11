/**
 * Loading skeleton for the /owner route segment.
 */
export default function OwnerLoading() {
  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header skeleton */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="h-7 w-32 rounded bg-gray-200 animate-pulse" />
            <div className="h-4 w-48 rounded bg-gray-100 animate-pulse" />
          </div>
          <div className="flex gap-3">
            <div className="h-9 w-40 rounded-lg bg-gray-200 animate-pulse" />
            <div className="h-9 w-32 rounded-lg bg-gray-200 animate-pulse" />
          </div>
        </div>

        {/* Metric cards skeleton */}
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-gray-200 bg-white p-5 space-y-3"
            >
              <div className="h-4 w-32 rounded bg-gray-200 animate-pulse" />
              <div className="h-8 w-40 rounded bg-gray-100 animate-pulse" />
            </div>
          ))}
        </div>

        {/* Chart skeleton */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="h-4 w-40 rounded bg-gray-200 animate-pulse mb-4" />
          <div className="h-64 w-full rounded bg-gray-100 animate-pulse" />
        </div>
      </div>
    </main>
  );
}
