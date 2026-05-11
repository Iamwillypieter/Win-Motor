"use client";

import { formatRupiah } from "@/lib/utils";
import useCart from "@/hooks/useCart";

/**
 * CartItem — displays a single item in the cart with quantity controls.
 * Decrementing quantity to 0 removes the item from the cart.
 *
 * @param {{ item: { productId: string, name: string, price: number, quantity: number, stock: number, imageUrl: string|null } }} props
 */
export default function CartItem({ item }) {
  const updateQuantity = useCart((state) => state.updateQuantity);
  const removeItem = useCart((state) => state.removeItem);

  const subtotal = item.price * item.quantity;

  function handleDecrement() {
    if (item.quantity <= 1) {
      removeItem(item.productId);
    } else {
      updateQuantity(item.productId, item.quantity - 1);
    }
  }

  function handleIncrement() {
    updateQuantity(item.productId, item.quantity + 1);
  }

  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-0">
      {/* Product image thumbnail */}
      <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300 text-lg select-none">
            📦
          </div>
        )}
      </div>

      {/* Product name and price */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
        <p className="text-xs text-gray-500">{formatRupiah(item.price)}</p>
      </div>

      {/* Quantity controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={handleDecrement}
          className="w-7 h-7 rounded-md border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold"
          aria-label={`Kurangi jumlah ${item.name}`}
        >
          −
        </button>
        <span className="w-8 text-center text-sm font-semibold text-gray-900">
          {item.quantity}
        </span>
        <button
          onClick={handleIncrement}
          disabled={item.quantity >= item.stock}
          className="w-7 h-7 rounded-md border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label={`Tambah jumlah ${item.name}`}
        >
          +
        </button>
      </div>

      {/* Subtotal */}
      <div className="text-right min-w-[72px]">
        <p className="text-sm font-semibold text-gray-900">
          {formatRupiah(subtotal)}
        </p>
      </div>
    </div>
  );
}
