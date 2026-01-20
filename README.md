# n8n Kubernetes Version Manager

A local development tool for running multiple n8n versions on Kubernetes. Deploy, compare, and test different n8n versions with isolated namespaces, automatic database snapshots, and a web UI for management.

## How It Works

The system uses Helm charts to deploy n8n instances into separate Kubernetes namespaces. Each deployment gets its own namespace (e.g., `n8n-v1-85-0`) with dedicated pods for the n8n main process, workers (in queue mode), and webhooks.

**Architecture:**
- Shared infrastructure (PostgreSQL, Redis) runs in `n8n-system` namespace
- Each n8n version runs in its own namespace with isolated pods
- Automatic database snapshots before each deployment
- Web UI communicates with a FastAPI backend that orchestrates kubectl/helm commands

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Desktop                            │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                   Kubernetes                             ││
│  │                                                          ││
│  │  ┌──────────────────┐  ┌──────────────────┐             ││
│  │  │   n8n-system     │  │   n8n-v1-85-0    │             ││
│  │  │  ┌────────────┐  │  │  ┌────────────┐  │             ││
│  │  │  │ PostgreSQL │  │  │  │  n8n main  │  │             ││
│  │  │  └────────────┘  │  │  └────────────┘  │             ││
│  │  │  ┌────────────┐  │  │  ┌────────────┐  │             ││
│  │  │  │   Redis    │  │  │  │  workers   │  │             ││
│  │  │  └────────────┘  │  │  └────────────┘  │             ││
│  │  └──────────────────┘  └──────────────────┘             ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## Requirements

- **Docker Desktop** with Kubernetes enabled (Settings > Kubernetes > Enable Kubernetes)
- **Helm 3** - `brew install helm` on macOS
- **kubectl** - comes with Docker Desktop, verify with `kubectl version`

Verify your setup:
```bash
kubectl config current-context  # Should show: docker-desktop
kubectl get nodes               # Should show one node in Ready state
helm version                    # Should show v3.x
```

## Quick Start

### 1. Start Infrastructure

```bash
# Clone and enter the repo
git clone https://github.com/krystianslowik/n8n-k8s-version-manager.git
cd n8n-k8s-version-manager

# Create system namespace and deploy shared services
kubectl create namespace n8n-system
helm install n8n-infra ./charts/n8n-infrastructure -n n8n-system

# Wait for infrastructure to be ready
kubectl wait --for=condition=ready pod -l app=postgres -n n8n-system --timeout=120s
kubectl wait --for=condition=ready pod -l app=redis -n n8n-system --timeout=120s
```

### 2. Start the Web UI

```bash
docker-compose up -d
```

Open http://localhost:3000 in your browser.

### 3. Deploy Your First n8n Version

Use the web UI or CLI:

**Web UI:** Click "Deploy Version", enter version (e.g., `1.85.0`), select mode, click Deploy.

**CLI:**
```bash
./scripts/deploy-version.sh 1.85.0 --queue
```

Access your n8n instance at `http://localhost:30185` (port derived from version number).

## Web UI Features

- **Deploy versions** - Select version from GitHub releases or enter manually
- **Queue/Regular mode** - Queue mode adds workers for background execution
- **Isolated database** - Option to use separate database for risky tests
- **Custom names** - Deploy same version multiple times with different names
- **Real-time status** - Pod states, events, and logs for each deployment
- **Database snapshots** - Create, restore, and manage snapshots
- **Infrastructure monitoring** - PostgreSQL and Redis health status

## CLI Usage

```bash
# Deploy in queue mode (main + workers + webhook)
./scripts/deploy-version.sh 1.85.0 --queue

# Deploy in regular mode (single process)
./scripts/deploy-version.sh 1.85.0 --regular

# Deploy with isolated database
./scripts/deploy-version.sh 1.85.0 --queue --isolated-db

# Deploy with custom name
./scripts/deploy-version.sh 1.85.0 --queue --name my-test

# List running versions
./scripts/list-versions.sh

# Remove a version
./scripts/remove-version.sh 1.85.0

# Create manual snapshot
./scripts/create-snapshot.sh

# List snapshots
./scripts/list-snapshots.sh

# Restore snapshot
./scripts/restore-snapshot.sh n8n-20260120-120000-pre-v1.85.0.sql
```

## Port Allocation

Ports are calculated from version numbers:
- `v1.85.0` → `http://localhost:30185`
- `v1.92.0` → `http://localhost:30192`
- `v2.0.0` → `http://localhost:30200`

Formula: `30000 + (major * 100) + minor`

Custom-named deployments use a hash-based port.

## Project Structure

```
.
├── api/                    # FastAPI backend
│   ├── main.py            # API entry point
│   ├── versions.py        # Deploy/delete/status endpoints
│   ├── snapshots.py       # Snapshot management
│   └── ...
├── web-ui-next/           # Next.js frontend
│   ├── app/               # Next.js App Router pages
│   ├── components/        # React components
│   └── lib/               # API client, types
├── charts/
│   ├── n8n-infrastructure/  # PostgreSQL, Redis, backups
│   └── n8n-instance/        # n8n deployment chart
├── scripts/               # CLI tools
└── docker-compose.yml     # Run UI + API
```

## Configuration

### Infrastructure (charts/n8n-infrastructure/values.yaml)
- PostgreSQL storage and resources
- Redis configuration
- Backup retention settings

### n8n Instance (charts/n8n-instance/values.yaml)
- Default version
- Worker replica count
- Resource limits
- Environment variables

## Troubleshooting

### Check pod status
```bash
kubectl get pods -n n8n-v1-85-0
```

### View logs
```bash
kubectl logs -f n8n-main-0 -n n8n-v1-85-0
```

### Test database connection
```bash
kubectl exec -it postgres-0 -n n8n-system -- psql -U admin -d n8n -c "SELECT 1"
```

### Reset everything
```bash
# Remove all n8n namespaces
kubectl delete namespace -l app=n8n

# Remove infrastructure
helm uninstall n8n-infra -n n8n-system
kubectl delete namespace n8n-system

# Stop UI
docker-compose down
```

## Development

### API (FastAPI)
```bash
cd api
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend (Next.js)
```bash
cd web-ui-next
npm install
npm run dev
```

## License

MIT
