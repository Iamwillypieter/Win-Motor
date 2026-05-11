# Project Structure

> This reflects the expected structure based on the requirements spec. Update once the project is scaffolded.

## Top-Level Layout

```
/
├── src/
│   ├── app/                  # Next.js App Router pages and layouts
│   │   ├── (auth)/           # Login page (unauthenticated)
│   │   ├── cashier/          # Kasir role pages (POS, orders, payment)
│   │   ├── warehouse/        # Staf Gudang pages (queue, inventory)
│   │   └── owner/            # Owner pages (dashboard, reports)
│   ├── components/           # Shared UI components
│   │   ├── ui/               # Primitive/base components (buttons, inputs, etc.)
│   │   └── [feature]/        # Feature-specific components
│   ├── lib/                  # Shared utilities and helpers
│   │   ├── auth.ts           # Auth helpers, session/JWT logic
│   │   ├── db.ts             # Database client (Prisma or similar)
│   │   └── utils.ts          # General utilities
│   ├── server/               # Server-side logic
│   │   ├── actions/          # Server actions or API route handlers
│   │   └── services/         # Business logic (orders, payments, inventory)
│   ├── types/                # Shared TypeScript types and enums
│   └── hooks/                # Client-side React hooks (real-time, cart, etc.)
├── prisma/                   # Database schema and migrations
│   ├── schema.prisma
│   └── migrations/
├── public/                   # Static assets
├── .kiro/                    # Kiro specs and steering
│   ├── specs/
│   └── steering/
└── tests/                    # Test files mirroring src/ structure
```

## Key Domain Entities

| Entity | Notes |
|---|---|
| `User` | Has `role`: `CASHIER`, `WAREHOUSE`, or `OWNER` |
| `Product` | Has `sku`, `stock`, `isActive` (soft delete) |
| `Order` | Has `orderStatus` and `paymentStatus`, linked to `User` (cashier) |
| `OrderItem` | Junction between `Order` and `Product` with `quantity` and `unitPrice` |
| `Invoice` | Generated on order completion, linked 1:1 to `Order` |

## Order & Payment Status Values

**orderStatus**: `waiting_preparation` → `preparing` → `ready` → `completed` | `cancelled`

**paymentStatus**: `pending` → `paid` | `expired`

## Conventions

- Route protection is enforced server-side — never rely solely on client-side redirects
- Real-time features (warehouse queue, cashier notifications) use a dedicated hook or context
- Cart state lives client-side only (no DB persistence until "Buat Pesanan" is submitted)
- All monetary values stored as integers (cents/rupiah) to avoid floating-point issues
- Invoice numbers must be unique and human-readable (e.g., `INV-20260507-0001`)
