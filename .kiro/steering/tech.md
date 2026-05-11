# Tech Stack

> This file will be updated as the design document is finalized. The entries below reflect what is known or strongly implied by the requirements spec.

## Application Type

- **Full-stack web application** with real-time capabilities
- Role-based access control (CASHIER, WAREHOUSE, OWNER)

## Expected Stack (to be confirmed in design.md)

| Layer | Technology |
|---|---|
| Frontend | React / Next.js (or similar SPA/SSR framework) |
| Backend | Node.js / Next.js API routes or dedicated REST/GraphQL API |
| Database | PostgreSQL (relational, supports atomic transactions) |
| Real-time | WebSockets or Server-Sent Events (SSE) |
| Auth | Session-based or JWT with role claims |
| File storage | Local or object storage (S3-compatible) for product images |
| Payment | QRIS integration via a payment gateway provider |

## Key Technical Constraints

- **Atomic transactions**: Payment confirmation + stock decrement must be a single DB transaction with rollback on failure
- **Real-time updates**: Order status and stock changes must propagate to all relevant clients in < 3 seconds
- **Image uploads**: Accept JPG, PNG, WEBP only; max 2 MB per file
- **Soft deletes**: Products use a soft-delete pattern (`deletedAt` or `isActive` flag) — never hard-delete

## Common Commands

> Update this section once the project is scaffolded.

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Database migrations
npm run db:migrate

# Seed database
npm run db:seed
```
