# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

tillywork is an open-source work management platform built as a monorepo using Nx. It provides project management, CRM, and automation capabilities with real-time collaboration features.

## Development Commands

```bash
# Install dependencies
npm install --legacy-peer-deps

# Development (runs both frontend and backend)
npm run dev

# Build for production
npm run build

# Linting
npm run lint

# Generate Swagger metadata
npm run swagger

# Reset database (drops and recreates)
npm run reset
```

### Nx-specific Commands

```bash
# Run single project
npx nx run frontend:serve
npx nx run backend:serve

# Run tests
npx nx run backend:test
npx nx run frontend:test

# Database migrations
npx nx run backend:migration:run      # Apply migrations
npx nx run backend:migration:revert   # Rollback last migration
npx nx run backend:migration:generate # Generate new migration
npx nx run backend:migration:create   # Create empty migration
```

## Architecture

### Monorepo Structure

```
packages/
├── backend/     # NestJS API (Fastify adapter)
├── frontend/    # Vue 3 + Nuxt SPA (Vuetify UI)
├── shared/      # Shared types and utilities
└── docs/        # Documentation (Nuxt-based)
```

### Backend (NestJS)

The backend follows a modular architecture with feature-based modules:

- **Entry point:** `packages/backend/src/main.ts`
- **App module:** `packages/backend/src/app/app.module.ts`
- **Feature modules:** `packages/backend/src/app/common/`

Key modules:
- `cards/` - Core work items (tasks, deals, etc.)
- `lists/` - Kanban boards, list views
- `workspaces/` - Multi-tenant workspaces
- `projects/` - Project containers
- `spaces/` - Organizational units within projects
- `automations/` - Workflow automation engine
- `fields/` - Custom fields system
- `views/` - Saved view configurations

Each module follows the pattern:
```
module-name/
├── module-name.module.ts      # NestJS module
├── module-name.controller.ts  # REST endpoints
├── module-name.service.ts     # Business logic
├── module-name.entity.ts      # TypeORM entity
├── module-name.subscriber.ts  # Entity change listeners
├── module-name.gateway.ts     # WebSocket gateway (if needed)
└── dto/                       # Request/Response DTOs
```

**Database:** PostgreSQL with TypeORM. Migrations are in `packages/backend/src/migrations/`.

**Queue Processing:** Bull (Redis-based) for background jobs like automation execution.

**Real-time:** Socket.io for live updates and Yjs for collaborative editing.

### Frontend (Vue 3 + Vuetify)

- **Entry point:** `packages/frontend/src/main.ts`
- **Root component:** `packages/frontend/src/app/App.vue`
- **State management:** Pinia stores in `packages/frontend/src/stores/`
- **API communication:** TanStack Query composables in `packages/frontend/src/composables/`
- **Components:** `packages/frontend/src/components/common/`

Key composables pattern:
```typescript
// packages/frontend/src/composables/useCard.ts
export function useCard() {
  // TanStack Query hooks for cards CRUD
}
```

### Shared Package

`packages/shared/src/lib/` contains:
- Type definitions used by both frontend and backend
- Validation schemas
- Utility functions (date formatting, pagination, etc.)

Import pattern: `import { CardType } from '@tillywork/shared'`

## Environment Configuration

Copy `.env.example` to `.env` and configure:

```bash
DATABASE_URL=postgres://user:password@host:5432/database?sslmode=prefer
REDIS_URL=redis://localhost:6379
TW_FRONTEND_URL=http://localhost:4200
TW_SECRET_KEY=<generate with: openssl rand -base64 32>
TW_VITE_API_URL=http://localhost:3000/v1
```

## Docker

```bash
# Development with local services
docker compose -f docker-compose.yml -f docker-compose.override.yml up

# Production build
docker compose up
```

The production Docker image uses:
- nginx for serving the frontend SPA
- PM2 for running the Node.js backend
- Multi-stage build for optimized image size

## Key Patterns

### Entity Subscribers
TypeORM subscribers (`*.subscriber.ts`) handle post-insert/update events for activity tracking and automation triggering.

### Access Control
ACL implemented via `access.strategy/` with strategies for workspace, space, and list-level permissions.

### Automation System
Event-driven automation in `automations/`:
- Triggers: `handlers/triggers/` (card.created, field.updated, etc.)
- Actions: `handlers/actions/` (set.field, create.card, etc.)
- Processor: `processors/automations.processor.ts` (Bull queue consumer)

### Card Data Model
Cards use a flexible `data` JSONB column for custom field values rather than separate columns per field type.

## Observability

The project includes Grafana stack integration:
- Tempo for distributed tracing (OpenTelemetry)
- Loki for log aggregation
- Grafana dashboards at port 3001
