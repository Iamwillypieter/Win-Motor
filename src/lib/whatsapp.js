/**
 * WhatsApp Notification Service
 *
 * Mengirim pesan WhatsApp ke pelanggan menggunakan Fonnte API.
 * Untuk mengaktifkan, isi FONNTE_TOKEN di .env.local.
 *
 * Jika FONNTE_TOKEN tidak diset, pesan hanya di-log ke console (mode simulasi).
 *
 * Dokumentasi Fonnte: https://fonnte.com/docs
 */

const FONNTE_API_URL = "https://api.fonnte.com/send";

/**
 * Normalisasi nomor WhatsApp ke format internasional tanpa tanda +.
 * "08123456789" → "628123456789"
 * "+628123456789" → "628123456789"
 *
 * @param {string} number
 * @returns {string}
 */
function normalizeWhatsapp(number) {
  const cleaned = number.replace(/\D/g, ""); // hapus semua non-digit
  if (cleaned.startsWith("0")) {
    return "62" + cleaned.slice(1);
  }
  if (cleaned.startsWith("62")) {
    return cleaned;
  }
  return cleaned;
}

/**
 * Kirim pesan WhatsApp ke nomor tertentu.
 *
 * @param {string} to - Nomor WhatsApp tujuan (format 08xx atau +62xx)
 * @param {string} message - Isi pesan (plain text)
 * @returns {Promise<{ success: boolean, simulated?: boolean, error?: string }>}
 */
export async function sendWhatsApp(to, message) {
  const token = process.env.FONNTE_TOKEN;
  const normalizedTo = normalizeWhatsapp(to);

  // Mode simulasi — jika token belum diset
  if (!token) {
    console.log(
      `[WhatsApp SIMULASI] Ke: ${normalizedTo}\n` +
      `─────────────────────────────────\n` +
      `${message}\n` +
      `─────────────────────────────────`
    );
    return { success: true, simulated: true };
  }

  try {
    const res = await fetch(FONNTE_API_URL, {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        target: normalizedTo,
        message,
        countryCode: "62",
      }),
    });

    const data = await res.json();

    if (!res.ok || data.status === false) {
      console.error("[WhatsApp] Gagal kirim pesan:", data);
      return { success: false, error: data.reason || "Gagal mengirim pesan" };
    }

    return { success: true };
  } catch (err) {
    console.error("[WhatsApp] Error:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Kirim notifikasi "Pesanan sedang disiapkan" ke pelanggan.
 * Dipanggil setelah pesanan online berhasil dibuat dan pembayaran dikonfirmasi.
 *
 * @param {{ customerName: string, customerWhatsapp: string, invoiceNumber: string, totalAmount: number, paymentMethod: string }} order
 */
export async function notifyOrderConfirmed(order) {
  const { customerName, customerWhatsapp, invoiceNumber, totalAmount, paymentMethod } = order;

  const methodLabel = {
    CASH: "COD (Bayar di Tempat)",
    QRIS: "QRIS",
    BANK_TRANSFER: "Transfer Bank",
    EWALLET_DANA: "DANA",
    EWALLET_OVO: "OVO",
    EWALLET_GOPAY: "GoPay",
  }[paymentMethod] ?? paymentMethod;

  const message =
    `Halo ${customerName}! 👋\n\n` +
    `✅ *Pesanan Anda telah dikonfirmasi!*\n\n` +
    `📋 No. Invoice: *${invoiceNumber}*\n` +
    `💳 Metode Bayar: ${methodLabel}\n` +
    `💰 Total: Rp ${totalAmount.toLocaleString("id-ID")}\n\n` +
    `🏪 Pesanan Anda sedang kami siapkan. Kami akan menghubungi Anda kembali saat pesanan siap dikirim.\n\n` +
    `Terima kasih telah berbelanja! 🙏`;

  return sendWhatsApp(customerWhatsapp, message);
}

/**
 * Kirim notifikasi "Pesanan siap dikirim / siap diambil" ke pelanggan.
 * Dipanggil saat staf gudang menekan tombol "Siap Dikirim".
 *
 * @param {{ customerName: string, customerWhatsapp: string, invoiceNumber: string, shippingAddress: string }} order
 */
export async function notifyOrderShipping(order) {
  const { customerName, customerWhatsapp, invoiceNumber, shippingAddress } = order;

  const message =
    `Halo ${customerName}! 👋\n\n` +
    `🚚 *Pesanan Anda sedang dalam perjalanan!*\n\n` +
    `📋 No. Invoice: *${invoiceNumber}*\n` +
    `📍 Alamat: ${shippingAddress}\n\n` +
    `Pesanan Anda sedang dikirim ke alamat di atas. Harap pastikan ada yang menerima di lokasi tersebut.\n\n` +
    `Jika ada pertanyaan, balas pesan ini. Terima kasih! 🙏`;

  return sendWhatsApp(customerWhatsapp, message);
}

/**
 * Kirim notifikasi "Pesanan siap diambil" ke pelanggan online.
 * Dipanggil saat staf gudang menekan tombol "Tandai Siap" (orderStatus → "ready").
 * Hanya untuk pesanan ONLINE — pesanan kasir tidak memerlukan notifikasi ini.
 *
 * @param {{ customerName: string, customerWhatsapp: string, invoiceNumber: string, totalAmount: number, paymentMethod: string }} order
 */
export async function notifyOrderReady(order) {
  const { customerName, customerWhatsapp, invoiceNumber, totalAmount, paymentMethod } = order;

  const methodLabel = {
    CASH: "COD (Bayar di Tempat)",
    QRIS: "QRIS",
    BANK_TRANSFER: "Transfer Bank",
    EWALLET_DANA: "DANA",
    EWALLET_OVO: "OVO",
    EWALLET_GOPAY: "GoPay",
  }[paymentMethod] ?? paymentMethod;

  const message =
    `Halo ${customerName}! 👋\n\n` +
    `✅ *Pesanan Anda sudah siap!*\n\n` +
    `📋 No. Invoice: *${invoiceNumber}*\n` +
    `💰 Total: Rp ${totalAmount.toLocaleString("id-ID")}\n` +
    `💳 Metode Bayar: ${methodLabel}\n\n` +
    `🏪 Pesanan Anda telah selesai disiapkan dan siap untuk diproses.\n\n` +
    `Terima kasih telah berbelanja! 🙏`;

  return sendWhatsApp(customerWhatsapp, message);
}
