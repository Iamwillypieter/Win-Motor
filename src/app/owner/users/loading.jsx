/**
 * Loading skeleton untuk halaman /owner/users
 */
export default function UsersLoading() {
  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <div className="h-6 w-48 rounded bg-gray-200 animate-pulse" />
            <div className="h-3 w-64 rounded bg-gray-100 animate-pulse" />
          </div>
          <div className="h-9 w-36 rounded-lg bg-gray-200 animate-pulse" />
        </div>

        {/* Table skeleton */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          {/* Table header */}
          <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 grid grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-3 rounded bg-gray-200 animate-pulse" />
            ))}
          </div>
          {/* Table rows */}
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="border-b border-gray-100 px-4 py-3.5 grid grid-cols-6 gap-4 items-center">
              <div className="h-3 w-16 rounded bg-gray-100 animate-pulse" />
              <div className="h-3 w-28 rounded bg-gray-200 animate-pulse" />
              <div className="h-3 w-36 rounded bg-gray-100 animate-pulse" />
              <div className="h-5 w-20 rounded-full bg-gray-100 animate-pulse" />
              <div className="h-5 w-16 rounded-full bg-gray-100 animate-pulse" />
              <div className="flex gap-2 justify-end">
                <div className="h-6 w-10 rounded bg-gray-100 animate-pulse" />
                <div className="h-6 w-24 rounded bg-gray-100 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
