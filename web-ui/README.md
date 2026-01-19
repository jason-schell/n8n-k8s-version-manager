# n8n Version Manager Web UI

Web interface for managing n8n version deployments on local Kubernetes cluster.

## Features

- Deploy n8n versions with one click
- Switch between queue mode and regular mode
- View all active versions with real-time status
- Remove versions with confirmation
- Manage database snapshots
- Monitor infrastructure health (Postgres, Redis)

## Requirements

- Docker Desktop with Kubernetes enabled
- n8n infrastructure deployed (Postgres, Redis)

## Development

### Backend

```bash
cd web-ui
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8080
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on http://localhost:5173 and proxies API calls to http://localhost:8080

## Production (Docker)

### Build

```bash
docker build -t n8n-version-ui .
```

### Run

```bash
docker run -d \
  --name n8n-ui \
  --network host \
  -v ~/.kube/config:/root/.kube/config:ro \
  -v $(pwd)/..:/workspace:ro \
  -p 8080:8080 \
  n8n-version-ui
```

Or use docker-compose:

```bash
docker-compose up -d
```

### Access

Open http://localhost:8080

## Architecture

- **Frontend**: Vite + React + shadcn/ui (compiled to static files)
- **Backend**: Python FastAPI server
- **Container**: Single Docker image with both frontend and backend
- **Scripts**: Reuses existing bash scripts via subprocess calls

## API Endpoints

- `GET /api/versions` - List deployed versions
- `POST /api/versions` - Deploy new version
- `DELETE /api/versions/{version}` - Remove version
- `GET /api/snapshots` - List database snapshots
- `POST /api/snapshots/restore` - Restore from snapshot
- `GET /api/infrastructure/status` - Check Postgres/Redis health

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, React Query
- **Backend**: Python 3.11, FastAPI, Uvicorn
- **Container**: Docker multi-stage build
