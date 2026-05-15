/**
 * Loading skeleton untuk halaman /warehouse/inventory
 */
export default function InventoryLoading() {
  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Toolbar skeleton */}
        <div className="flex items-center justify-between">
          <div className="h-6 w-32 rounded bg-gray-200 animate-pulse" />
          <div className="flex gap-2">
            <div className="h-9 w-48 rounded-lg bg-gray-100 animate-pulse" />
            <div className="h-9 w-32 rounded-lg bg-gray-200 animate-pulse" />
          </div>
        </div>

        {/* Table skeleton */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 grid grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-3 rounded bg-gray-200 animate-pulse" />
            ))}
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="border-b border-gray-100 px-4 py-3 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-gray-100 animate-pulse flex-shrink-0" />
              <div className="flex-1 h-3 rounded bg-gray-200 animate-pulse" />
              <div className="w-20 h-3 rounded bg-gray-100 animate-pulse" />
              <div className="w-24 h-3 rounded bg-gray-100 animate-pulse" />
              <div className="w-12 h-3 rounded bg-gray-200 animate-pulse" />
              <div className="flex gap-2">
                <div className="w-14 h-7 rounded bg-gray-100 animate-pulse" />
                <div className="w-14 h-7 rounded bg-gray-100 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
