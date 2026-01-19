# n8n Kubernetes Version Switching

Quickly test different n8n versions on Kubernetes with queue mode support and automatic database snapshots.

## Features

- 🚀 Deploy any n8n version in under 2 minutes
- 🔄 Toggle between queue mode and regular mode
- 💾 Automatic database snapshots before version switches
- 🔒 Optional isolated databases for risky tests
- 🧹 Clean namespace-based isolation
- 📊 Run 1-2 versions simultaneously

## Prerequisites

- Docker Desktop with Kubernetes enabled
- Helm 3 installed
- kubectl configured for docker-desktop context

## Quick Start

### 1. Deploy Infrastructure (One-time)

```bash
# Create system namespace
kubectl create namespace n8n-system

# Install shared infrastructure (PostgreSQL, Redis, Backups)
helm install n8n-infra ./charts/n8n-infrastructure --namespace n8n-system

# Wait for infrastructure to be ready
kubectl wait --for=condition=ready pod -l app=postgres -n n8n-system --timeout=300s
kubectl wait --for=condition=ready pod -l app=redis -n n8n-system --timeout=300s
```

### 2. Deploy Your First n8n Version

```bash
# Deploy n8n v1.123 in queue mode
./scripts/deploy-version.sh 1.123 --queue

# Wait for pods to be ready
kubectl wait --for=condition=ready pod -l component=main -n n8n-v1-123 --timeout=300s

# Access n8n UI
open http://localhost:30123
```

### 3. Deploy Another Version

```bash
# Deploy n8n v2.1 in regular mode (no queue)
./scripts/deploy-version.sh 2.1 --regular

# Access at different port
open http://localhost:30201
```

### 4. List Running Versions

```bash
./scripts/list-versions.sh
```

Output:
```
=== n8n Versions Deployed ===

Namespace: n8n-v1-123
  Version: 1.123
  Mode: Queue
  Pods:
    n8n-main-0 - Running
    n8n-worker-abc123 - Running
    n8n-worker-def456 - Running
    n8n-webhook-ghi789 - Running
  Access: http://localhost:30123

Namespace: n8n-v2-1
  Version: 2.1
  Mode: Regular
  Pods:
    n8n-main-0 - Running
  Access: http://localhost:30201
```

## Usage

### Deploy a Version

```bash
# Queue mode (default)
./scripts/deploy-version.sh 1.123 --queue

# Regular mode
./scripts/deploy-version.sh 2.1 --regular

# With isolated database
./scripts/deploy-version.sh 2.1 --queue --isolated-db

# With custom name (enables multiple deployments of same version)
./scripts/deploy-version.sh 1.85.0 --regular --name acme-prod
./scripts/deploy-version.sh 1.85.0 --regular --name acme-staging
```

### List Versions

```bash
./scripts/list-versions.sh
```

### Remove a Version

```bash
./scripts/remove-version.sh 1.123
```

### Manage Database Snapshots

```bash
# List available snapshots
./scripts/list-snapshots.sh

# Restore from snapshot
./scripts/restore-snapshot.sh n8n-20260119-120000-pre-v1.123.sql
```

## Web UI

### Quick Start

```bash
cd web-ui
docker-compose up -d
```

Access the web UI at http://localhost:8080

### Features

- **Deploy versions**: Enter version number, select mode, click Deploy
- **View active versions**: Real-time status updates every 5 seconds
- **Remove versions**: Click Delete with confirmation dialog
- **Manage snapshots**: Expand snapshots section, restore with confirmation
- **Infrastructure status**: Monitor Postgres and Redis health in header

#### New Features (2026-01-19)

**Custom Deployment Naming**
- Add optional custom name to deployments
- Enables multiple deployments of same version
- Example: Deploy "acme-prod" and "acme-staging" both running v1.85.0

**Manual Snapshot Management**
- Create database snapshots on demand via UI
- Snapshots named with timestamp: `n8n-{timestamp}-manual.sql`
- Complements automatic pre-deploy snapshots

**GitHub Version Discovery**
- Quick-select badges show recent n8n releases
- Click badge to auto-fill version input
- Reduces typos and makes discovering new versions easier

### Development Mode

See [web-ui/README.md](web-ui/README.md) for development setup.

## Web UI - Next.js (New)

Modern UI built with Next.js 15 and shadcn/ui.

See [web-ui-next/README.md](web-ui-next/README.md) for details.

**Access:** http://localhost:3000

**Features:**
- Smooth animations and loading states
- Real-time polling updates
- Modern shadcn/ui components
- Server-side rendering

### Stopping the UI

```bash
cd web-ui
docker-compose down
```

## Architecture

### Infrastructure (n8n-system namespace)
- **PostgreSQL**: Shared database for all versions
- **Redis**: Message queue for queue mode
- **Backup Storage**: PVC for database snapshots

### n8n Instances (per-version namespaces)
- **Queue Mode**: Main process + Workers + Webhook process
- **Regular Mode**: Single main process

## Port Allocation

Ports are auto-calculated from version numbers:
- v1.123 → Port 30123
- v2.1 → Port 30201
- vX.Y → Port 30000 + (X * 100) + Y

For custom deployment names, ports are calculated using a hash:
- Custom name → Port 30000 + (CRC32 hash mod 1000)

## Database Management

### Shared Database (Default)
All versions connect to the same PostgreSQL instance. Test how different versions handle the same data.

### Isolated Database
Deploy with `--isolated-db` to create a dedicated database for risky tests.

### Automatic Snapshots
Before every version deployment, a snapshot is automatically created:
- Format: `n8n-YYYYMMDD-HHMMSS-pre-vX.Y.sql`
- Location: `/backups` volume in n8n-system namespace
- Retention: Last 10 snapshots (configurable)

## Troubleshooting

### Check Pod Status
```bash
kubectl get pods -n n8n-v1-123
```

### View Logs
```bash
# Main process
kubectl logs -f n8n-main-0 -n n8n-v1-123

# Worker process
kubectl logs -f <worker-pod-name> -n n8n-v1-123
```

### Database Connection Issues
```bash
# Test PostgreSQL connectivity
kubectl exec -it postgres-0 -n n8n-system -- psql -U admin -d n8n -c "SELECT version();"

# Check n8n database config
kubectl exec -it n8n-main-0 -n n8n-v1-123 -- env | grep DB_
```

### Redis Connection Issues (Queue Mode)
```bash
# Test Redis connectivity
kubectl exec -it <redis-pod-name> -n n8n-system -- redis-cli ping

# Check n8n Redis config
kubectl exec -it n8n-main-0 -n n8n-v1-123 -- env | grep REDIS
```

## Configuration

### Infrastructure Values
Edit `charts/n8n-infrastructure/values.yaml`:
- PostgreSQL storage size, resources
- Redis storage size, resources
- Backup retention policy

### Instance Values
Edit `charts/n8n-instance/values.yaml`:
- Default n8n version
- Queue mode settings
- Worker replica count
- Resource limits

## Cleanup

### Remove a Single Version
```bash
./scripts/remove-version.sh 1.123
```

### Remove Everything
```bash
# Remove all n8n versions
kubectl delete namespace -l app=n8n

# Remove infrastructure
helm uninstall n8n-infra --namespace n8n-system
kubectl delete namespace n8n-system
```

## Contributing

This project was designed for quick n8n version testing and learning Kubernetes. Feel free to extend it with:
- Web UI for version management
- Automated testing after deployment
- Metrics and monitoring
- Ingress support for host-based routing

## License

MIT
