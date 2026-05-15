/**
 * Loading skeleton untuk halaman /cashier/orders
 */
export default function CashierOrdersLoading() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-6 py-6">
        {/* Toolbar skeleton */}
        <div className="flex items-center justify-between mb-4">
          <div className="h-4 w-24 rounded bg-gray-200 animate-pulse" />
          <div className="flex gap-2">
            <div className="h-8 w-48 rounded-lg bg-gray-200 animate-pulse" />
            <div className="h-8 w-16 rounded bg-gray-100 animate-pulse" />
          </div>
        </div>

        {/* Order cards skeleton */}
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-gray-200 p-5 space-y-3"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1.5">
                  <div className="h-4 w-36 rounded bg-gray-200 animate-pulse" />
                  <div className="h-3 w-28 rounded bg-gray-100 animate-pulse" />
                </div>
                <div className="h-6 w-24 rounded-full bg-gray-200 animate-pulse" />
              </div>
              <div className="space-y-1.5">
                <div className="h-3 w-full rounded bg-gray-100 animate-pulse" />
                <div className="h-3 w-3/4 rounded bg-gray-100 animate-pulse" />
              </div>
              <div className="flex justify-between pt-1">
                <div className="h-4 w-16 rounded bg-gray-100 animate-pulse" />
                <div className="h-4 w-24 rounded bg-gray-200 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
