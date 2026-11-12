import connectDB from "@/lib/db";
import Order from "@/models/Order";
import Invoice from "@/models/Invoice";
import Return from "@/models/Return";

/**
 * Custom error class for analytics operations.
 */
export class AnalyticsError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = "AnalyticsError";
    this.code = code;
  }
}

/**
 * Build a date range for a specific calendar month (YYYY-MM).
 * Returns tanggal 1 sampai akhir bulan yang sebenarnya (28/29/30/31).
 * @param {string} yearMonth - Format "YYYY-MM"
 * @returns {{ startDate: Date, endDate: Date }}
 */
function buildMonthRange(yearMonth) {
  const [year, month] = yearMonth.split("-").map(Number);
  const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
  // Hari ke-0 bulan berikutnya = hari terakhir bulan ini
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);
  return { startDate, endDate };
}

/**
 * Build a date range query object from range string, explicit from/to, or month.
 * @param {"daily"|"weekly"|"monthly"|string} range
 * @param {string|null} [from] - ISO date string (inclusive)
 * @param {string|null} [to]   - ISO date string (inclusive, end of day)
 * @param {string|null} [month] - Format "YYYY-MM" untuk filter per bulan
 * @returns {{ startDate: Date, endDate: Date }}
 */
function buildDateRange(range, from = null, to = null, month = null) {
  // Prioritas: month > from/to > range
  if (month) {
    return buildMonthRange(month);
  }

  if (from && to) {
    const startDate = new Date(from);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(to);
    endDate.setHours(23, 59, 59, 999);
    return { startDate, endDate };
  }

  // Range preset — monthly sekarang menggunakan bulan kalender penuh
  const now = new Date();
  let startDate, endDate;

  switch (range) {
    case "daily":
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(now);
      endDate.setHours(23, 59, 59, 999);
      break;
    case "weekly":
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 6);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(now);
      endDate.setHours(23, 59, 59, 999);
      break;
    case "monthly":
    default:
      // Tanggal 1 sampai akhir bulan berjalan (28/29/30/31)
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      break;
  }

  return { startDate, endDate };
}

/**
 * Hitung total nilai retur (Return.totalAmount) dalam rentang tanggal tertentu.
 * Juga mengembalikan breakdown per kasir dan per SKU untuk keperluan ranking/top-products.
 *
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {Promise<{
 *   totalReturnAmount: number,
 *   byCashier: Object.<string, number>,   // cashierName → totalReturnAmount
 *   bySku: Object.<string, { qty: number, amount: number }> // sku → { qty, amount }
 * }>}
 */
async function getReturnTotals(startDate, endDate) {
  const result = await Return.aggregate([
    { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
    {
      $facet: {
        // Total keseluruhan
        overall: [
          { $group: { _id: null, total: { $sum: "$totalAmount" } } },
        ],
        // Breakdown per kasir (untuk offset ranking)
        byCashier: [
          { $group: { _id: "$cashierName", total: { $sum: "$totalAmount" } } },
        ],
        // Breakdown per SKU (untuk offset top-products)
        bySku: [
          { $unwind: "$items" },
          {
            $group: {
              _id: "$items.sku",
              qty: { $sum: "$items.quantity" },
              amount: { $sum: "$items.subtotal" },
            },
          },
        ],
      },
    },
  ]);

  const facets = result[0] ?? {};

  const totalReturnAmount = facets.overall?.[0]?.total ?? 0;

  const byCashier = {};
  for (const row of (facets.byCashier ?? [])) {
    if (row._id) byCashier[row._id] = row.total;
  }

  const bySku = {};
  for (const row of (facets.bySku ?? [])) {
    if (row._id) bySku[row._id] = { qty: row.qty, amount: row.amount };
  }

  return { totalReturnAmount, byCashier, bySku };
}

/**
 * Get today's metrics (resets every day at midnight).
 * @returns {Promise<{ totalRevenue: number, totalOrders: number, averageOrderValue: number }>}
 */
export async function getDailyMetrics() {
  await connectDB();
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const [orderResult, { totalReturnAmount }] = await Promise.all([
    Order.aggregate([
      { $match: { orderStatus: "completed", createdAt: { $gte: startOfDay, $lte: endOfDay } } },
      { $group: { _id: null, totalRevenue: { $sum: "$totalAmount" }, totalOrders: { $sum: 1 } } },
    ]),
    getReturnTotals(startOfDay, endOfDay),
  ]);

  if (!orderResult.length) return { totalRevenue: 0, totalOrders: 0, averageOrderValue: 0, totalReturns: totalReturnAmount };
  const { totalRevenue: grossRevenue, totalOrders } = orderResult[0];
  const totalRevenue = Math.max(0, grossRevenue - totalReturnAmount);
  return {
    totalRevenue,
    totalOrders,
    averageOrderValue: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0,
    totalReturns: totalReturnAmount,
  };
}

/**
 * Get current calendar month metrics (tanggal 1 s/d akhir bulan).
 * @returns {Promise<{ totalRevenue: number, totalOrders: number, averageOrderValue: number, monthLabel: string }>}
 */
export async function getMonthlyMetrics() {
  await connectDB();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const [orderResult, { totalReturnAmount }] = await Promise.all([
    Order.aggregate([
      { $match: { orderStatus: "completed", createdAt: { $gte: startOfMonth, $lte: endOfMonth } } },
      { $group: { _id: null, totalRevenue: { $sum: "$totalAmount" }, totalOrders: { $sum: 1 } } },
    ]),
    getReturnTotals(startOfMonth, endOfMonth),
  ]);

  const monthLabel = now.toLocaleString("id-ID", { month: "long", year: "numeric" });

  if (!orderResult.length) return { totalRevenue: 0, totalOrders: 0, averageOrderValue: 0, monthLabel, totalReturns: totalReturnAmount };
  const { totalRevenue: grossRevenue, totalOrders } = orderResult[0];
  const totalRevenue = Math.max(0, grossRevenue - totalReturnAmount);
  return {
    totalRevenue,
    totalOrders,
    averageOrderValue: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0,
    monthLabel,
    totalReturns: totalReturnAmount,
  };
}

/**
 * Get summary metrics for completed orders in the given time range,
 * segmented by orderType (OFFLINE / ONLINE).
 *
 * @param {"daily"|"weekly"|"monthly"} range
 * @param {string|null} [from] - ISO date string
 * @param {string|null} [to]   - ISO date string
 * @param {string|null} [month] - Format "YYYY-MM"
 * @returns {Promise<{
 *   totalRevenue: number,
 *   offlineRevenue: number,
 *   onlineRevenue: number,
 *   totalOrders: number,
 *   offlineOrders: number,
 *   onlineOrders: number,
 *   averageOrderValue: number
 * }>}
 */
export async function getMetrics(range, from = null, to = null, month = null) {
  await connectDB();

  const { startDate, endDate } = buildDateRange(range, from, to, month);

  // Jalankan paralel: aggregasi order dan total retur dalam rentang yang sama
  const [orderResult, { totalReturnAmount }] = await Promise.all([
    Order.aggregate([
      {
        $match: {
          orderStatus: "completed",
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: "$orderType", // "OFFLINE" | "ONLINE" | null (legacy orders without orderType)
          revenue: { $sum: "$totalAmount" },
          orders: { $sum: 1 },
        },
      },
    ]),
    getReturnTotals(startDate, endDate),
  ]);

  // Initialise counters
  let offlineRevenue = 0;
  let onlineRevenue = 0;
  let offlineOrders = 0;
  let onlineOrders = 0;

  for (const row of orderResult) {
    if (row._id === "ONLINE") {
      onlineRevenue = row.revenue;
      onlineOrders = row.orders;
    } else {
      // "OFFLINE" or null (legacy orders created before orderType field existed)
      offlineRevenue += row.revenue;
      offlineOrders += row.orders;
    }
  }

  // Kurangi total retur dari pendapatan bruto.
  // Retur tidak di-track per orderType sehingga dikurangi proporsional dari
  // offline terlebih dahulu, sisanya dari online (hampir semua retur adalah kasir = offline).
  const grossTotal = offlineRevenue + onlineRevenue;
  const deduction = Math.min(totalReturnAmount, grossTotal);

  // Distribusikan pengurangan: offline dulu, lalu sisanya ke online
  const offlineDeduction = Math.min(deduction, offlineRevenue);
  const onlineDeduction = deduction - offlineDeduction;

  offlineRevenue = Math.max(0, offlineRevenue - offlineDeduction);
  onlineRevenue = Math.max(0, onlineRevenue - onlineDeduction);

  const totalRevenue = offlineRevenue + onlineRevenue;
  const totalOrders = offlineOrders + onlineOrders;
  const averageOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

  return {
    totalRevenue,
    offlineRevenue,
    onlineRevenue,
    totalOrders,
    offlineOrders,
    onlineOrders,
    averageOrderValue,
    totalReturns: totalReturnAmount,
  };
}

/**
 * Get daily revenue chart data for the given time range.
 * Returns one entry per day in the range, with revenue = 0 for days with no orders.
 *
 * @param {"daily"|"weekly"|"monthly"} range
 * @param {string|null} [from] - ISO date string
 * @param {string|null} [to]   - ISO date string
 * @param {string|null} [month] - Format "YYYY-MM"
 * @returns {Promise<Array<{ date: string, revenue: number }>>}
 */
export async function getChartData(range, from = null, to = null, month = null) {
  await connectDB();

  const { startDate, endDate } = buildDateRange(range, from, to, month);

  // Jalankan paralel: revenue per hari dari Order + return per hari dari Return
  const [orderResult, returnResult] = await Promise.all([
    Order.aggregate([
      {
        $match: {
          orderStatus: "completed",
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          revenue: { $sum: "$totalAmount" },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]),
    Return.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          returnAmount: { $sum: "$totalAmount" },
        },
      },
    ]),
  ]);

  // Build maps dari hasil agregasi
  const revenueMap = {};
  for (const entry of orderResult) {
    revenueMap[entry._id] = entry.revenue;
  }

  const returnMap = {};
  for (const entry of returnResult) {
    returnMap[entry._id] = entry.returnAmount;
  }

  // Fill in all days in the range, kurangi return per hari
  const chartData = [];
  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);

  while (cursor <= endDate) {
    const dateStr = cursor.toISOString().slice(0, 10);
    const grossRevenue = revenueMap[dateStr] || 0;
    const returnAmt = returnMap[dateStr] || 0;
    chartData.push({
      date: dateStr,
      revenue: Math.max(0, grossRevenue - returnAmt),
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return chartData;
}

/**
 * Get cashier ranking by total sales (completed orders) for the current month.
 * Returns top cashiers sorted by totalRevenue descending.
 *
 * @param {number} [limit=10] - Max number of cashiers to return
 * @returns {Promise<Array<{ cashierId: string, cashierName: string, totalOrders: number, totalRevenue: number }>>}
 */
export async function getCashierRanking(limit = 10) {
  await connectDB();

  // Always use current calendar month
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const [invoiceResult, { byCashier: returnByCashier }] = await Promise.all([
    Invoice.aggregate([
      {
        $match: {
          transactionAt: { $gte: startOfMonth, $lte: endOfMonth },
        },
      },
      {
        $group: {
          _id: "$cashierName",
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: "$totalAmount" },
        },
      },
      {
        $sort: { totalRevenue: -1 },
      },
      {
        $limit: limit,
      },
      {
        $project: {
          _id: 0,
          cashierName: "$_id",
          totalOrders: 1,
          totalRevenue: 1,
        },
      },
    ]),
    getReturnTotals(startOfMonth, endOfMonth),
  ]);

  // Kurangi retur per kasir dari totalRevenue masing-masing
  return invoiceResult.map((row) => {
    const returnAmt = returnByCashier[row.cashierName] ?? 0;
    return {
      ...row,
      totalRevenue: Math.max(0, row.totalRevenue - returnAmt),
      totalReturns: returnAmt,
    };
  });
}

/**
 * Get top selling products by quantity sold for the current month.
 * @param {number} [limit=10]
 * @returns {Promise<Array<{ productName: string, sku: string, totalQty: number, totalRevenue: number }>>}
 */
export async function getTopProducts(limit = 10) {
  await connectDB();

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const [invoiceResult, { bySku: returnBySku }] = await Promise.all([
    Invoice.aggregate([
      {
        $match: {
          transactionAt: { $gte: startOfMonth, $lte: endOfMonth },
        },
      },
      { $unwind: "$items" },
      {
        $group: {
          _id: { productName: "$items.productName", sku: "$items.sku" },
          totalQty: { $sum: "$items.quantity" },
          totalRevenue: { $sum: "$items.subtotal" },
        },
      },
      { $sort: { totalQty: -1 } },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          productName: "$_id.productName",
          sku: "$_id.sku",
          totalQty: 1,
          totalRevenue: 1,
        },
      },
    ]),
    getReturnTotals(startOfMonth, endOfMonth),
  ]);

  // Kurangi retur per SKU dari qty dan revenue masing-masing produk
  return invoiceResult.map((row) => {
    const ret = returnBySku[row.sku];
    if (!ret) return row;
    return {
      ...row,
      totalQty: Math.max(0, row.totalQty - ret.qty),
      totalRevenue: Math.max(0, row.totalRevenue - ret.amount),
      totalReturns: ret.qty,
    };
  });
}

/**
 * Generate a CSV string for completed orders in the given time range.
 * Columns: invoiceNumber, tanggal, nama Kasir, items, totalAmount, metode pembayaran,
 *          orderType, customerName, customerWhatsapp, shippingAddress
 *
 * Uses Invoice collection for cashierName snapshot.
 * For OFFLINE orders, the customer-specific columns (customerName, customerWhatsapp,
 * shippingAddress) will be empty for backward compatibility.
 *
 * @param {"daily"|"weekly"|"monthly"} range
 * @param {string|null} [from] - ISO date string
 * @param {string|null} [to]   - ISO date string
 * @returns {Promise<string>} CSV string
 */
export async function exportCSV(range, from = null, to = null) {
  await connectDB();

  const { startDate, endDate } = buildDateRange(range, from, to);

  // Fetch invoices for completed orders in range (Invoice has cashierName snapshot)
  const invoices = await Invoice.find({
    transactionAt: { $gte: startDate, $lte: endDate },
  })
    .sort({ transactionAt: 1 })
    .lean();

  // CSV header
  const header = [
    "invoiceNumber",
    "tanggal",
    "nama Kasir",
    "items",
    "totalAmount",
    "metode pembayaran",
    "orderType",
    "customerName",
    "customerWhatsapp",
    "shippingAddress",
  ];

  const rows = invoices.map((inv) => {
    const tanggal = new Date(inv.transactionAt).toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

    const itemsStr = inv.items
      .map((item) => `${item.productName} x${item.quantity}`)
      .join("; ");

    // For OFFLINE orders (or legacy orders without orderType), customer fields are empty
    const orderType = inv.orderType || "OFFLINE";
    const customerName = inv.customerName || "";
    const customerWhatsapp = inv.customerWhatsapp || "";
    // Wrap shippingAddress in quotes to handle commas/newlines in addresses
    const shippingAddress = inv.shippingAddress ? `"${inv.shippingAddress.replace(/"/g, '""')}"` : "";

    return [
      inv.invoiceNumber,
      tanggal,
      inv.cashierName,
      `"${itemsStr}"`,
      inv.totalAmount,
      inv.paymentMethod,
      orderType,
      customerName,
      customerWhatsapp,
      shippingAddress,
    ].join(",");
  });

  return [header.join(","), ...rows].join("\n");
}
