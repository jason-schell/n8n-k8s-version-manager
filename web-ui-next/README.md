# n8n Version Manager - Web UI

Next.js frontend for the n8n Kubernetes Version Manager.

## Tech Stack

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS v4
- shadcn/ui components
- TanStack Query v5
- Sonner (toasts)

## Development

```bash
# Install dependencies
npm install

# Run dev server (requires API on port 8000)
npm run dev
```

Open http://localhost:3000

### Environment

Create `.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Docker

```bash
# Build
docker build -t n8n-ui .

# Run
docker run -p 3000:3000 -e NEXT_PUBLIC_API_URL=http://localhost:8000 n8n-ui
```

Or use docker-compose from the project root:
```bash
docker-compose up -d
```

## Structure

```
web-ui-next/
├── app/
│   ├── layout.tsx       # Root layout
│   ├── page.tsx         # Dashboard
│   └── providers.tsx    # React Query setup
├── components/
│   ├── ui/              # shadcn/ui
│   ├── sidebar.tsx
│   ├── deploy-drawer.tsx
│   ├── deployments-table.tsx
│   ├── deployment-details-drawer.tsx
│   └── snapshots-panel.tsx
└── lib/
    ├── api.ts           # API client
    └── types.ts         # TypeScript types
```

## API Endpoints

- `GET /api/versions` - List deployments
- `POST /api/versions` - Deploy version
- `DELETE /api/versions/{namespace}` - Remove deployment
- `GET /api/versions/{namespace}/events` - K8s events
- `GET /api/versions/{namespace}/pods` - Pod status
- `GET /api/versions/{namespace}/logs` - Container logs
- `GET /api/snapshots` - List snapshots
- `POST /api/snapshots/create` - Create snapshot
- `POST /api/snapshots/restore` - Restore snapshot
- `GET /api/versions/available` - GitHub releases
- `GET /api/infrastructure/status` - Health check
