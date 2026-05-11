"use client";

/**
 * DateRangePicker — filter waktu untuk dashboard Owner.
 *
 * Mode:
 * - "daily"   : hari ini
 * - "weekly"  : 7 hari terakhir
 * - "monthly" : bulan berjalan (tanggal 1 s/d akhir bulan)
 * - "month"   : pilih bulan spesifik (YYYY-MM) untuk perbandingan antar bulan
 *
 * @param {{
 *   range: string,
 *   month: string|null,
 *   onChange: (range: string, month: string|null) => void
 * }} props
 */

const RANGES = [
  { value: "daily",   label: "Hari Ini" },
  { value: "weekly",  label: "7 Hari" },
  { value: "monthly", label: "Bulan Ini" },
  { value: "month",   label: "Pilih Bulan" },
];

// Generate daftar bulan dari Januari tahun lalu sampai bulan ini
function generateMonthOptions() {
  const options = [];
  const now = new Date();
  const current = new Date(now.getFullYear() - 1, now.getMonth(), 1);

  while (
    current.getFullYear() < now.getFullYear() ||
    (current.getFullYear() === now.getFullYear() &&
      current.getMonth() <= now.getMonth())
  ) {
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, "0");
    const value = `${year}-${month}`;
    const label = current.toLocaleString("id-ID", {
      month: "long",
      year: "numeric",
    });
    options.push({ value, label });
    current.setMonth(current.getMonth() + 1);
  }

  // Urutkan terbaru di atas
  return options.reverse();
}

const MONTH_OPTIONS = generateMonthOptions();

export default function DateRangePicker({ range, month, onChange }) {
  const activeMode = range === "month" ? "month" : range;

  // Default month = bulan ini jika belum dipilih
  const defaultMonth = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  })();

  const selectedMonth = month || defaultMonth;

  function handleRangeClick(value) {
    if (value === "month") {
      onChange("month", selectedMonth);
    } else {
      onChange(value, null);
    }
  }

  function handleMonthChange(e) {
    onChange("month", e.target.value);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Tombol preset range */}
      <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
        {RANGES.map((r) => (
          <button
            key={r.value}
            onClick={() => handleRangeClick(r.value)}
            className={[
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap",
              activeMode === r.value
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700",
            ].join(" ")}
            aria-pressed={activeMode === r.value}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Dropdown pilih bulan — hanya tampil saat mode "month" aktif */}
      {activeMode === "month" && (
        <select
          value={selectedMonth}
          onChange={handleMonthChange}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          aria-label="Pilih bulan"
        >
          {MONTH_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
