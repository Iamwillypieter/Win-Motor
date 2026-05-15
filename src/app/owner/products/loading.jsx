/**
 * Loading skeleton untuk halaman /owner/products
 */
export default function OwnerProductsLoading() {
  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="space-y-1.5">
          <div className="h-7 w-36 rounded bg-gray-200 animate-pulse" />
          <div className="h-3 w-28 rounded bg-gray-100 animate-pulse" />
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
              <div className="h-3 w-20 rounded bg-gray-100 animate-pulse" />
              <div className="h-7 w-12 rounded bg-gray-200 animate-pulse" />
            </div>
          ))}
        </div>

        {/* Filter bar */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex gap-3">
          <div className="flex-1 h-9 rounded-lg bg-gray-100 animate-pulse" />
          <div className="w-36 h-9 rounded-lg bg-gray-100 animate-pulse" />
          <div className="w-32 h-9 rounded-lg bg-gray-100 animate-pulse" />
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 grid grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-3 rounded bg-gray-200 animate-pulse" />
            ))}
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="border-b border-gray-100 px-4 py-3 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-gray-100 animate-pulse flex-shrink-0" />
              <div className="flex-1 h-3 rounded bg-gray-200 animate-pulse" />
              <div className="w-20 h-3 rounded bg-gray-100 animate-pulse" />
              <div className="w-24 h-3 rounded bg-gray-100 animate-pulse" />
              <div className="w-12 h-3 rounded bg-gray-200 animate-pulse" />
              <div className="w-16 h-5 rounded-full bg-gray-100 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
