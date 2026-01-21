# n8n Kubernetes Version Manager

Run multiple n8n versions on local Kubernetes. Each deployment gets its own namespace, isolated database, and unique port.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Docker Desktop                                │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                      Kubernetes                                 │ │
│  │                                                                 │ │
│  │  ┌─────────────────┐   ┌─────────────────┐                     │ │
│  │  │   n8n-system    │   │   n8n-v1-85-0   │   ...more versions  │ │
│  │  │                 │   │                 │                     │ │
│  │  │  ┌───────────┐  │   │  ┌───────────┐  │                     │ │
│  │  │  │ PostgreSQL│  │   │  │ PostgreSQL│  │  (isolated DB)      │ │
│  │  │  │ (system)  │  │   │  │ (per-ns)  │  │                     │ │
│  │  │  └───────────┘  │   │  └───────────┘  │                     │ │
│  │  │  ┌───────────┐  │   │  ┌───────────┐  │                     │ │
│  │  │  │   Redis   │  │   │  │  n8n main │  │                     │ │
│  │  │  │ (shared)  │  │   │  └───────────┘  │                     │ │
│  │  │  └───────────┘  │   │  ┌───────────┐  │                     │ │
│  │  │                 │   │  │  workers  │  │  (queue mode)       │ │
│  │  │                 │   │  └───────────┘  │                     │ │
│  │  │                 │   │  ┌───────────┐  │                     │ │
│  │  │                 │   │  │  webhook  │  │                     │ │
│  │  │                 │   │  └───────────┘  │                     │ │
│  │  └─────────────────┘   └─────────────────┘                     │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
         │                           │
         ▼                           ▼
    localhost:3000              localhost:30185
    (Web UI + API)              (n8n instance)
```

**Components:**
- **n8n-system namespace**: Shared Redis for queue coordination, system PostgreSQL for backup storage
- **Per-version namespace**: Each deployment runs in `n8n-v{version}` with its own PostgreSQL StatefulSet, n8n main pod, and optionally workers + webhook pods (queue mode)
- **Web UI**: Next.js frontend at port 3000
- **API**: FastAPI backend that orchestrates kubectl/helm commands

**Deployment modes:**
- **Regular**: Single n8n process, ~512Mi memory
- **Queue**: Main + workers + webhook pods, ~1792Mi memory, background job execution

## Requirements

- Docker Desktop with Kubernetes enabled
- Helm 3 (`brew install helm`)

```bash
kubectl config current-context  # Should show: docker-desktop
```

## Quick Start

```bash
# 1. Install infrastructure
kubectl create namespace n8n-system
helm install n8n-infra ./charts/n8n-infrastructure -n n8n-system

# 2. Start the web UI
docker-compose up -d

# 3. Open http://localhost:3000
```

## Usage

### Web UI

1. Click **Deploy New Version**
2. Select version from dropdown or search
3. Choose mode (Queue or Regular)
4. Optionally restore from a database snapshot
5. Click Deploy

### Deployment Details

Click any deployment row to view:
- **Status**: Pod states, container health, restart counts
- **Events**: Kubernetes events timeline
- **Logs**: Container logs with pod/container filtering
- **Config**: Connection details, credentials, environment

### Snapshots

Database snapshots stored as pg_dump files on the host. Operations:
- Create from deployment (row menu)
- Restore to deployment (Status tab)
- Upload existing backup files
- Delete old snapshots

### CLI

```bash
./scripts/deploy-version.sh 1.85.0 --queue   # Deploy
./scripts/list-versions.sh                    # List
./scripts/remove-version.sh 1.85.0           # Remove
```

## Port Mapping

Formula: `30000 + (major × 100) + (minor × 10) + patch`

| Version | Calculation | Port |
|---------|-------------|------|
| 1.85.0 | 30000 + 100 + 850 + 0 | 30950 |
| 1.85.4 | 30000 + 100 + 850 + 4 | 30954 |
| 1.92.0 | 30000 + 100 + 920 + 0 | 31020 |
| 2.0.0 | 30000 + 200 + 0 + 0 | 30200 |

Custom-named deployments use CRC32 hash mod 1000 + 30000.

## Project Structure

```
├── api/                      # FastAPI backend
│   ├── main.py              # Entry point, CORS
│   ├── versions.py          # Deploy/delete/status/events/logs/config
│   ├── snapshots.py         # Snapshot CRUD, restore
│   └── available_versions.py # GitHub releases API
├── web-ui-next/             # Next.js frontend
│   ├── app/                 # App Router pages
│   ├── components/          # React components
│   └── lib/                 # API client, types
├── charts/
│   ├── n8n-infrastructure/  # PostgreSQL, Redis, backup jobs
│   └── n8n-instance/        # n8n deployment chart
├── scripts/                 # CLI tools
└── docker-compose.yml       # Run UI + API
```

## Cleanup

```bash
kubectl delete namespace -l app=n8n     # Remove all deployments
helm uninstall n8n-infra -n n8n-system  # Remove infrastructure
kubectl delete namespace n8n-system
docker-compose down                      # Stop UI
```

## Development

```bash
# API
cd api && pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend
cd web-ui-next && npm install && npm run dev
```
