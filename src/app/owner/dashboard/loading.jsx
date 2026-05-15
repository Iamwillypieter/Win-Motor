/**
 * Loading skeleton untuk halaman /owner/dashboard
 */
export default function DashboardLoading() {
  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="h-8 w-48 rounded bg-gray-200 animate-pulse" />
          <div className="flex gap-3">
            <div className="h-9 w-44 rounded-lg bg-gray-200 animate-pulse" />
            <div className="h-9 w-32 rounded-lg bg-gray-200 animate-pulse" />
          </div>
        </div>

        {/* Metric cards */}
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
              <div className="h-3 w-24 rounded bg-gray-200 animate-pulse" />
              <div className="h-7 w-32 rounded bg-gray-100 animate-pulse" />
            </div>
          ))}
        </div>

        {/* Summary metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl border border-gray-200 bg-gray-100" />
          ))}
        </div>

        {/* Chart */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="h-4 w-40 rounded bg-gray-200 animate-pulse mb-4" />
          <div className="h-64 w-full rounded bg-gray-100 animate-pulse" />
        </div>

        {/* Rankings */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
              <div className="h-4 w-32 rounded bg-gray-200 animate-pulse" />
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-gray-100 animate-pulse" />
                  <div className="flex-1 h-3 rounded bg-gray-100 animate-pulse" />
                  <div className="h-3 w-20 rounded bg-gray-200 animate-pulse" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
