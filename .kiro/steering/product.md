# Product Overview

Web-based Point of Sale (POS) system supporting three user roles:

- **Kasir (Cashier)** — creates orders and processes payments (cash or QRIS)
- **Staf Gudang (Warehouse Staff)** — manages inventory and prepares orders
- **Owner** — views analytics dashboard and exports reports

## Core Flow

1. Kasir builds a cart from the product catalog and creates an order (`waiting_preparation`)
2. Warehouse staff sees the order in real-time queue and marks it `ready`
3. Kasir receives a notification and processes payment (cash or QRIS)
4. On payment confirmation, stock is decremented atomically and order becomes `completed`
5. A digital invoice is generated for the completed transaction

## Key Business Rules

- Stock is **not** deducted at order creation — only on successful payment (atomic DB operation)
- Order and payment status changes must be reflected in real-time (< 3 seconds) across roles
- Soft-delete products to preserve historical order data
- QRIS codes expire after 5 minutes if not confirmed
- All role-based access is enforced server-side (HTTP 403 on unauthorized routes)

## Language

The product UI and documentation are in **Bahasa Indonesia**. Code, variable names, and technical identifiers use English.
