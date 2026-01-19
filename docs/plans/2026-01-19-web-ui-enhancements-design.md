# Web UI Functionality Enhancements Design

**Date:** 2026-01-19
**Goal:** Add custom deployment naming, manual snapshot management, and GitHub version discovery to the n8n Version Manager web UI

---

## Overview

Three core functional enhancements:

1. **Custom Deployment Naming** - Support custom namespace names to enable multiple deployments of same version
2. **Manual Snapshot Management** - Add ability to create database snapshots on demand
3. **GitHub Version Discovery** - Fetch recent n8n releases and present as quick-select options

---

## 1. Custom Deployment Naming

### Problem
Currently, deployments use auto-generated namespaces like `n8n-v1-85-0` based on version number. This prevents:
- Deploying same version multiple times
- Custom naming for customer-specific instances (e.g., "acme-prod", "beta-customer")
- Testing scenarios with multiple instances

### Solution

**Add optional deployment name field to deploy form:**
- If provided: Use custom name as namespace
- If blank: Auto-generate `n8n-v{major}-{minor}-{patch}` (current behavior)

### API Changes

**Frontend (`DeployVersionCard.tsx`):**
```typescript
interface DeployRequest {
  version: string
  mode: 'queue' | 'regular'
  isolated_db: boolean
  name?: string  // NEW: optional custom name
}
```

**Backend (`api/versions.py`):**
```python
class DeployRequest(BaseModel):
    version: str
    mode: str
    isolated_db: bool = False
    name: Optional[str] = None  # NEW
```

**Deployment Script (`scripts/deploy-version.sh`):**
```bash
# Add --name parameter
# Usage: deploy-version.sh <version> [--queue|--regular] [--isolated-db] [--name <custom-name>]

if [ -n "$CUSTOM_NAME" ]; then
  NAMESPACE="$CUSTOM_NAME"
  RELEASE_NAME="$CUSTOM_NAME"
else
  # Current auto-generation logic
  NAMESPACE="n8n-v${VERSION_SLUG}"
  RELEASE_NAME="n8n-v${VERSION_SLUG}"
fi
```

### Port Calculation Logic

**Current:** Port = 30000 + (major * 100) + minor
**Problem:** Custom names don't have version numbers

**Solution:**
```bash
if [ -n "$CUSTOM_NAME" ]; then
  # Hash-based port for custom names
  # Use CRC32 of name, mod 1000, add 30000
  # Gives ports 30000-30999
  PORT=$(echo -n "$CUSTOM_NAME" | cksum | awk '{print 30000 + ($1 % 1000)}')
else
  # Version-based port (current logic)
  PORT=$((30000 + (MAJOR * 100) + MINOR))
fi
```

### Validation

**Frontend validation:**
- Lowercase alphanumeric + hyphens only (`^[a-z0-9-]+$`)
- Max 63 characters (Kubernetes namespace limit)
- Must start and end with alphanumeric
- Show inline error on invalid input

**Backend validation:**
- Check namespace doesn't already exist
- Return error: `{"success": false, "error": "Namespace 'acme-prod' already exists"}`

### Version Extraction

**Problem:** Parser extracts version from namespace pattern `n8n-v(\d+)-(\d+)-(\d+)`
**Solution:** Custom names won't match pattern - need to store version separately

**Update Helm chart to add version label:**
```yaml
# In templates/_helpers.tpl
labels:
  version: {{ .Values.n8nVersion | quote }}
```

**Update parser to fall back to label:**
```python
# If namespace doesn't match version pattern
version_match = re.search(r'n8n-v(\d+)-(\d+)-(\d+)', namespace)
if version_match:
    version = f"{version_match.group(1)}.{version_match.group(2)}.{version_match.group(3)}"
else:
    # For custom names, version comes from label (need to query k8s)
    version = "custom"  # Or fetch from namespace labels
```

---

## 2. Manual Snapshot Management

### Problem
- Snapshots only created automatically before deploys (when `isolatedDB=false`)
- No way to create ad-hoc snapshots
- No snapshots exist currently because all deployments used `isolatedDB=true`

### Solution

**Hybrid approach:**
- Keep automatic pre-deploy snapshots (safety net)
- Add manual "Create Snapshot Now" button

### API Changes

**New endpoint:**
```python
# api/snapshots.py
@router.post("/create")
async def create_snapshot():
    """Create manual database snapshot."""
    result = subprocess.run(
        ["/workspace/scripts/create-snapshot.sh"],
        capture_output=True,
        text=True,
        cwd="/workspace"
    )

    if result.returncode != 0:
        return {
            "success": False,
            "error": result.stderr,
            "output": result.stdout
        }

    return {
        "success": True,
        "message": "Snapshot creation started",
        "output": result.stdout
    }
```

### New Script: `scripts/create-snapshot.sh`

```bash
#!/bin/bash
set -e

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="n8n-${TIMESTAMP}-manual.sql"

# Create Kubernetes Job to run snapshot
cat <<EOF | kubectl apply -f -
apiVersion: batch/v1
kind: Job
metadata:
  name: manual-snapshot-${TIMESTAMP}
  namespace: n8n-system
spec:
  ttlSecondsAfterFinished: 300
  template:
    spec:
      restartPolicy: OnFailure
      containers:
      - name: snapshot
        image: postgres:16
        command:
        - /bin/bash
        - -c
        - |
          set -e

          # Wait for postgres
          until pg_isready -h postgres.n8n-system.svc.cluster.local -U n8n_user; do
            echo "Waiting for PostgreSQL..."
            sleep 2
          done

          # Create backup
          PGPASSWORD=n8n_password pg_dump \\
            -h postgres.n8n-system.svc.cluster.local \\
            -U n8n_user \\
            -d n8n \\
            > "/backups/${BACKUP_FILE}"

          if [ -f "/backups/${BACKUP_FILE}" ]; then
            SIZE=\$(du -h "/backups/${BACKUP_FILE}" | cut -f1)
            echo "Snapshot created: ${BACKUP_FILE} (\${SIZE})"
          else
            echo "ERROR: Snapshot creation failed"
            exit 1
          fi
        volumeMounts:
        - name: backup-storage
          mountPath: /backups
      volumes:
      - name: backup-storage
        persistentVolumeClaim:
          claimName: backup-storage
EOF

echo "Manual snapshot job created: manual-snapshot-${TIMESTAMP}"
```

### Frontend Changes

**Add button to `SnapshotsSection.tsx`:**
```typescript
const createMutation = useMutation({
  mutationFn: () => api.createSnapshot(),
  onSuccess: (data) => {
    if (data.success) {
      toast({
        title: 'Snapshot creation started',
        description: 'Snapshot will appear in list when complete',
      })
      // List auto-refreshes via polling
    } else {
      toast({
        variant: 'destructive',
        title: 'Failed to create snapshot',
        description: data.error,
      })
    }
  },
})

// In render:
<Button onClick={() => createMutation.mutate()}>
  📸 Create Snapshot Now
</Button>
```

### Snapshot Naming Convention
- **Manual:** `n8n-{timestamp}-manual.sql`
- **Pre-deploy:** `n8n-{timestamp}-pre-v{version}.sql`

---

## 3. GitHub Version Discovery

### Problem
Users must manually type version numbers, easy to mistype or use non-existent versions.

### Solution
Fetch recent n8n releases from GitHub API and present as quick-select badge buttons.

### API Implementation

**New endpoint:**
```python
# api/available_versions.py
import requests
from fastapi import APIRouter
from datetime import datetime, timedelta

router = APIRouter()

# Simple in-memory cache (5 minute TTL)
_cache = {"versions": [], "expires": None}

@router.get("/api/versions/available")
async def get_available_versions():
    now = datetime.utcnow()

    # Return cache if fresh
    if _cache["expires"] and now < _cache["expires"]:
        return {"versions": _cache["versions"]}

    try:
        # Fetch from GitHub
        response = requests.get(
            "https://api.github.com/repos/n8n-io/n8n/releases",
            headers={"Accept": "application/vnd.github+json"},
            timeout=5
        )

        if response.status_code == 200:
            releases = response.json()
            # Extract tag_name, strip 'n8n@' prefix
            versions = [
                r["tag_name"].replace("n8n@", "").replace("v", "")
                for r in releases[:20]  # Top 20 releases
                if not r["draft"] and not r["prerelease"]
            ]

            # Update cache
            _cache["versions"] = versions
            _cache["expires"] = now + timedelta(minutes=5)

            return {"versions": versions}
    except Exception as e:
        # Log error but don't fail
        print(f"GitHub API error: {e}")

    # Fallback: return cached even if expired, or empty
    return {"versions": _cache["versions"]}
```

**Register router in `main.py`:**
```python
from api import available_versions

app.include_router(available_versions.router)
```

### Frontend Implementation

**Update `DeployVersionCard.tsx`:**
```typescript
const { data: availableVersions } = useQuery({
  queryKey: ['available-versions'],
  queryFn: api.getAvailableVersions,
  staleTime: 5 * 60 * 1000, // 5 minutes
  refetchOnMount: false,
})

// In render, above version input:
{availableVersions?.versions && (
  <div className="flex gap-2 flex-wrap">
    <Label className="text-xs text-muted-foreground">Quick select:</Label>
    {availableVersions.versions.slice(0, 6).map(v => (
      <Badge
        key={v}
        variant="outline"
        className="cursor-pointer hover:bg-primary hover:text-primary-foreground"
        onClick={() => setVersion(v)}
      >
        {v}
      </Badge>
    ))}
  </div>
)}
```

### Rate Limiting

GitHub API limit: 60 requests/hour without auth

**Mitigation:**
- 5-minute in-memory cache
- Graceful degradation (hide quick-select on failure)
- Max 12 fetches/hour = well under limit

---

## Implementation Priority

1. **Custom deployment naming** (highest value, enables key use cases)
2. **Manual snapshots** (safety feature, frequently needed)
3. **GitHub version discovery** (UX improvement, nice-to-have)

---

## Testing Checklist

### Custom Naming
- [ ] Deploy with blank name → auto-generates `n8n-v{version}`
- [ ] Deploy with custom name "acme-prod" → creates namespace `acme-prod`
- [ ] Deploy same version with different names → both succeed
- [ ] Invalid name (uppercase, special chars) → shows validation error
- [ ] Duplicate name → returns error before starting deploy
- [ ] Custom name deployment shows correct info in table
- [ ] Port calculation works for custom names (no conflicts)

### Manual Snapshots
- [ ] Click "Create Snapshot Now" → job starts
- [ ] Snapshot appears in list after completion
- [ ] Snapshot file has correct naming: `n8n-{timestamp}-manual.sql`
- [ ] Restore manual snapshot → works correctly
- [ ] Multiple rapid snapshot creates → don't conflict
- [ ] Snapshot creation fails gracefully if postgres unavailable

### GitHub Version Discovery
- [ ] Available versions load on page load
- [ ] Click version badge → fills input field
- [ ] Cache works (no re-fetch within 5 minutes)
- [ ] GitHub API failure → gracefully hides quick-select
- [ ] Version list shows recent releases only (no drafts/prereleases)

---

## Future Enhancements (Out of Scope)

- Snapshot deletion/cleanup
- Snapshot size limits
- Download snapshots locally
- Schedule automatic snapshots
- PostgreSQL StatefulSet for isolated DB mode
- Deployment progress streaming
- Pod logs viewer
- Resource usage metrics
