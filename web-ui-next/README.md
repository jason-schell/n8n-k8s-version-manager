# n8n Version Manager - Next.js UI

Modern web interface for managing n8n deployments with Next.js 15 and shadcn/ui.

## Features

- Deploy n8n versions with smooth form validation
- Real-time deployment monitoring with polling
- Database snapshot management with restore
- Beautiful UI with shadcn/ui components
- Fast server-side rendering with Next.js App Router
- Skeleton loaders and smooth animations
- Responsive design

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript
- **UI:** shadcn/ui (19 components)
- **Styling:** Tailwind CSS v4
- **Data Fetching:** TanStack Query v5
- **Icons:** lucide-react
- **Toasts:** Sonner

## Development

### Prerequisites

- Node.js 20+
- FastAPI backend running on port 8000

### Setup

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Environment Variables

Create `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Production

### Docker Build

```bash
# Build image
docker build -t n8n-ui-next .

# Run container
docker run -p 3000:3000 -e NEXT_PUBLIC_API_URL=http://localhost:8000 n8n-ui-next
```

### Docker Compose

```bash
# Start both frontend and backend
docker-compose up -d

# Frontend: http://localhost:3000
# Backend: http://localhost:8000
```

## Project Structure

```
web-ui-next/
├── app/
│   ├── layout.tsx          # Root layout with providers
│   ├── page.tsx            # Dashboard page
│   ├── providers.tsx       # React Query + Sonner
│   └── globals.css         # Global styles
├── components/
│   ├── ui/                 # shadcn/ui components
│   ├── sidebar.tsx         # Navigation sidebar
│   ├── stat-card.tsx       # Stat display cards
│   ├── deployments-table.tsx   # Deployments table
│   ├── deploy-drawer.tsx   # Deploy form drawer
│   └── snapshots-panel.tsx # Snapshots management
├── lib/
│   ├── api.ts              # API client
│   ├── types.ts            # TypeScript types
│   └── utils.ts            # Utility functions
```

## Key Features

### Smooth Loading States

- Skeleton loaders for all async content
- Staggered fade-in animations for table rows
- Pulse animations for pending statuses

### Form Validation

- Real-time validation for custom deployment names
- GitHub version quick-select with caching
- Clear error messages and feedback

### Real-time Updates

- Auto-polling deployments every 5 seconds
- Auto-polling snapshots every 10 seconds
- Infrastructure status monitoring

### Responsive Design

- Mobile-friendly sidebar
- Collapsible sections
- Touch-friendly interactions

## API Endpoints

All endpoints proxied to FastAPI backend:

- `GET /api/versions` - List deployments
- `POST /api/versions/deploy` - Deploy version
- `DELETE /api/versions/{version}` - Remove deployment
- `GET /api/snapshots` - List snapshots
- `POST /api/snapshots/create` - Create snapshot
- `POST /api/snapshots/restore` - Restore snapshot
- `GET /api/versions/available` - GitHub versions
- `GET /api/infrastructure/status` - Health check

## Migration from Old UI

The new UI runs alongside the old UI during migration:

- **Old UI:** http://localhost:8080 (Vite + React)
- **New UI:** http://localhost:3000 (Next.js)

Both talk to the same FastAPI backend on port 8000.

## License

MIT
