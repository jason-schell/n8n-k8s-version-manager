# Kubernetes-based n8n Version Switching System

**Date:** 2026-01-19
**Author:** Design Session with Claude
**Status:** Design Complete - Ready for Implementation

## Overview

A Kubernetes-based system for quickly testing different n8n versions with support for queue mode, automatic database snapshots, and flexible isolation strategies. Runs on Docker Desktop's Kubernetes (kubeadm) for simplicity.

## Goals

1. **Quick version testing** - Rapidly switch between n8n versions (e.g., 1.123, 2.1) to test workflows and compatibility
2. **Learning Kubernetes** - Hands-on experience with K8s concepts while solving a real problem
3. **Team collaboration** - Multiple people can test different versions simultaneously (1-2 versions at a time)
4. **Flexible architecture** - Toggle between queue mode and regular mode per version
5. **Data safety** - Automatic snapshots before version switches, with option for isolated databases

## Architecture Overview

### Kubernetes Environment
- **Platform:** Docker Desktop's built-in Kubernetes (kubeadm)
- **Package Manager:** Helm for managing deployments
- **Simultaneous Versions:** 1-2 versions running at a time

### Deployment Modes
Each n8n version can run in two modes:

**Queue Mode** (default):
- Main process (StatefulSet) - UI and orchestration
- Worker processes (Deployment) - executes workflows from Redis queue
- Webhook process (Deployment) - handles webhook requests
- Requires Redis for job queue

**Regular Mode**:
- Single n8n pod (Deployment)
- No Redis required
- No separate workers or webhook processes

### Shared Infrastructure
Runs once per cluster in `n8n-system` namespace:
- **PostgreSQL** (StatefulSet) - shared database for all versions
- **Redis** (Deployment) - message queue (created when queue mode enabled)
- **Backup CronJob** - automatic database snapshots

### Version Management
- One Helm chart with parameters: `n8nVersion`, `queueMode`, `isolatedDB`
- Each version deployed to its own namespace (e.g., `n8n-v1-123`, `n8n-v2-1`)
- Default: All versions share PostgreSQL database
- Option: Deploy with isolated database for risky tests (`isolatedDB=true`)
- Automatic snapshot taken before each version switch

## Helm Chart Structure

### Two-Chart System

**1. Infrastructure Chart** (`n8n-infrastructure`)
- Deploys cluster-wide shared services
- Components: PostgreSQL, Redis, Backup CronJob
- Namespace: `n8n-system`
- Install once: `helm install n8n-infra ./charts/n8n-infrastructure`

**2. n8n Instance Chart** (`n8n-instance`)
- Deploys a specific n8n version
- Installed per version with custom parameters
- Conditional rendering based on `queueMode` flag

### Key Helm Values

```yaml
# values.yaml for n8n-instance chart
n8nVersion: "1.123"          # Docker image tag
queueMode: true               # Enable queue architecture
isolatedDB: false             # Use shared vs dedicated DB
replicas:
  workers: 2                  # Number of worker pods (queue mode only)
service:
  type: NodePort
  nodePort: 30123            # Auto-calculated from version
```

### Chart Directory Structure

```
charts/
├── n8n-infrastructure/
│   ├── Chart.yaml
│   ├── values.yaml
│   └── templates/
│       ├── postgres-statefulset.yaml
│       ├── redis-deployment.yaml
│       └── backup-cronjob.yaml
└── n8n-instance/
    ├── Chart.yaml
    ├── values.yaml
    └── templates/
        ├── main-statefulset.yaml      # Always created
        ├── worker-deployment.yaml     # Only if queueMode=true
        ├── webhook-deployment.yaml    # Only if queueMode=true
        └── simple-deployment.yaml     # Only if queueMode=false
```

## Data Management and Snapshots

### Default: Shared Database
- All n8n versions connect to same PostgreSQL instance
- Connection via ConfigMap:
  ```yaml
  DB_TYPE: postgresdb
  DB_POSTGRESDB_HOST: postgres.n8n-system.svc.cluster.local
  DB_POSTGRESDB_DATABASE: n8n
  ```
- Allows testing how different versions handle the same workflows

### Automatic Snapshot System
- **Pre-switch hook** runs before deploying new version
- Implemented as Kubernetes Job with Helm hook:
  ```yaml
  annotations:
    "helm.sh/hook": pre-install,pre-upgrade
  ```
- Executes `pg_dump` to create timestamped backup:
  ```bash
  pg_dump -h postgres.n8n-system -U admin n8n > \
    /backups/n8n-$(date +%Y%m%d-%H%M%S)-pre-v${NEW_VERSION}.sql
  ```
- Snapshots stored in PersistentVolume at `/backups`
- Retention: Keep last 10 snapshots (configurable)

### Isolated Database Option
- Enable with `--set isolatedDB=true`
- Creates dedicated PostgreSQL StatefulSet in version's namespace
- Uses PVC cloning to copy current database as starting point
- Useful for testing risky migrations or major version upgrades
- Example:
  ```bash
  helm install n8n-v2-1 ./charts/n8n-instance \
    --set n8nVersion=2.1,isolatedDB=true \
    --namespace n8n-v2-1 --create-namespace
  ```

### Restore Process
- Manual (Phase 1):
  ```bash
  kubectl exec -it postgres-0 -n n8n-system -- \
    psql -U admin -d n8n -f /backups/snapshot-name.sql
  ```
- Future: "Restore from snapshot" button in UI

## Namespace and Isolation Strategy

### Namespace Design
- **`n8n-system`** - Infrastructure namespace (Postgres, Redis, backups)
- **`n8n-v<version>`** - One namespace per n8n version
  - Examples: `n8n-v1-123`, `n8n-v2-1`
  - Version uses hyphens instead of dots (DNS compatibility)

### Benefits
- Clean isolation - delete namespace to remove entire version
- Easy listing: `kubectl get namespaces | grep n8n-v`
- Resource quotas per version if needed
- Clear service discovery (e.g., `n8n-main.n8n-v1-123.svc.cluster.local`)

### Port Allocation
- Each version exposed via NodePort on unique port
- Port calculation: `30000 + (version_major * 100) + version_minor`
  - v1.123 → NodePort 30123 → `http://localhost:30123`
  - v2.1 → NodePort 30201 → `http://localhost:30201`
- Alternative: Use Ingress with host-based routing

### Resource Labels
All resources tagged with:
```yaml
labels:
  app: n8n
  version: "1.123"
  mode: "queue"  # or "regular"
```

Query example: `kubectl get pods -l app=n8n,version=1.123 --all-namespaces`

## Version Switching Workflow

### Initial Setup (One-time)

```bash
# Verify Kubernetes is running
kubectl cluster-info

# Set context to docker-desktop (if not already)
kubectl config use-context docker-desktop

# Install infrastructure
helm install n8n-infra ./charts/n8n-infrastructure

# Wait for infrastructure to be ready
kubectl wait --for=condition=ready pod -l app=postgres -n n8n-system --timeout=300s
```

### Deploy First Version

```bash
# Install n8n v1.123 in queue mode
helm install n8n-v1-123 ./charts/n8n-instance \
  --set n8nVersion=1.123 \
  --set queueMode=true \
  --set replicas.workers=2 \
  --namespace n8n-v1-123 \
  --create-namespace

# Access at http://localhost:30123
```

### Switch to Different Version

```bash
# Deploy n8n v2.1 in regular mode (no queue)
# Pre-install hook automatically creates DB snapshot
helm install n8n-v2-1 ./charts/n8n-instance \
  --set n8nVersion=2.1 \
  --set queueMode=false \
  --namespace n8n-v2-1 \
  --create-namespace

# Access at http://localhost:30201
```

### Helper Scripts

Create these convenience scripts:

- `./scripts/deploy-version.sh 1.123 --queue` - Wrapper for Helm install with smart defaults
- `./scripts/list-versions.sh` - Shows all deployed versions and their status
- `./scripts/remove-version.sh 1.123` - Cleans up a version (helm uninstall + namespace deletion)
- `./scripts/list-snapshots.sh` - Shows available database snapshots
- `./scripts/restore-snapshot.sh <snapshot-name>` - Restores DB from snapshot

### What Happens During Version Switch

1. Pre-install hook triggers snapshot Job
2. Snapshot saved to `/backups` PVC with timestamp and version tag
3. New namespace created with version-specific name
4. n8n pods deployed with specified image tag and mode
5. Pods connect to shared Postgres (or isolated if specified)
6. Service exposed on calculated NodePort

## Future UI Considerations

### Phase 1: Start with CLI
- Use helper scripts for version management
- Learn Kubernetes and Helm mechanics hands-on
- Validate architecture before adding UI complexity

### Phase 2: Simple Web UI

**Stack Options:**
- Lightweight: HTML + JavaScript + Node.js/Python backend
- Backend uses Kubernetes client library (`@kubernetes/client-node` or `kubernetes` Python)

**API Endpoints:**
```
POST   /api/deploy-version      # Deploy new version
GET    /api/list-versions        # List deployed versions
DELETE /api/remove-version/:ver  # Remove version
GET    /api/snapshots            # List DB snapshots
POST   /api/restore-snapshot     # Restore from snapshot
```

**UI Features:**
- **Version dropdown** - Select from available n8n versions (Docker Hub API or static list)
- **Deploy form** - Version selection, queue mode toggle, isolated DB checkbox
- **Active versions table** - Shows deployed versions with status, links, resource usage
- **Snapshot management** - List snapshots, restore with one click
- **Quick actions** - Delete version, view logs, scale workers

**UI Deployment:**
- Run as pod in `n8n-system` namespace
- Use RBAC to grant service account permissions
- Expose on NodePort (e.g., `http://localhost:30000`)

**Security:**
- Local development: Basic auth or token
- Team use: OAuth, LDAP, audit logging

## Implementation Phases

### Phase 1: Foundation (Week 1)
- Create infrastructure Helm chart (Postgres, Redis, backup job)
- Create n8n-instance Helm chart with queue mode support
- Test basic deployment and version switching

### Phase 2: Automation (Week 2)
- Implement automatic snapshot system
- Create helper scripts for common operations
- Add isolated DB support
- Test restore process

### Phase 3: Polish (Week 3)
- Refine port allocation and service discovery
- Add monitoring and logging
- Document usage for team
- Create quick-start guide

### Phase 4: UI (Future)
- Design and implement web UI
- Add authentication
- Deploy UI to cluster
- User testing with team

## Success Criteria

- ✅ Can deploy any n8n version in under 2 minutes
- ✅ Can toggle queue mode vs regular mode per version
- ✅ Database automatically backed up before version switches
- ✅ Can run 1-2 versions simultaneously
- ✅ Can restore from snapshots if upgrade goes wrong
- ✅ Team members can independently test different versions
- ✅ Clean removal of versions (no leftover resources)

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Database migration breaks during version switch | Automatic snapshots + easy restore process |
| Resource exhaustion (CPU/memory) | Namespace quotas, clear visibility of running versions |
| Version conflicts with shared database | Isolated DB option for risky tests |
| Complex Helm charts hard to maintain | Start simple, add complexity incrementally, good documentation |
| Team confusion with multiple versions | Clear naming, helper scripts, good UI (Phase 4) |

## Open Questions

- Should we add automated testing for deployed versions?
- Do we need support for custom n8n builds (not from Docker Hub)?
- Should snapshots be compressed to save space?
- Do we want metrics/monitoring dashboards per version?

## References

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Helm Documentation](https://helm.sh/docs/)
- [n8n Queue Mode Documentation](https://docs.n8n.io/hosting/scaling/queue-mode/)
- [Docker Desktop Kubernetes](https://docs.docker.com/desktop/kubernetes/)
