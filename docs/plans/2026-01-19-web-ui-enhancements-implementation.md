# Web UI Enhancements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add custom deployment naming, manual snapshot management, and GitHub version discovery to the n8n Version Manager web UI

**Architecture:** Three independent features built in priority order. Backend API endpoints trigger bash scripts for infrastructure operations. Frontend uses React Query for data fetching with optimistic updates.

**Tech Stack:** React 18 + TypeScript, TanStack React Query, FastAPI, Bash scripts, Kubernetes, Helm, GitHub REST API

---

## Task 1: Backend - Custom Deployment Naming API

Add optional `name` parameter to deployment endpoint to support custom namespace names.

**Files:**
- Modify: `web-ui/api/versions.py`

**Step 1: Read existing deployment endpoint**

```bash
cat web-ui/api/versions.py
```

Expected: See current `DeployRequest` model and `/deploy` endpoint

**Step 2: Add name field to DeployRequest model**

In `web-ui/api/versions.py`, update the `DeployRequest` class:

```python
class DeployRequest(BaseModel):
    version: str
    mode: str
    isolated_db: bool = False
    name: Optional[str] = None  # NEW: optional custom name
```

**Step 3: Update deploy endpoint to pass name to script**

In the `/deploy` endpoint, modify the script call to include `--name` parameter when provided:

```python
@router.post("/deploy")
async def deploy_version(request: DeployRequest):
    cmd = [
        "/workspace/scripts/deploy-version.sh",
        request.version,
        f"--{request.mode}",
    ]

    if request.isolated_db:
        cmd.append("--isolated-db")

    if request.name:
        cmd.extend(["--name", request.name])

    result = subprocess.run(cmd, capture_output=True, text=True, cwd="/workspace")
    # ... rest of endpoint
```

**Step 4: Test API manually**

```bash
cd /Users/slowik/Desktop/n8n/k8s/.worktrees/web-ui-enhancements/web-ui
# Start backend if not running
python -m uvicorn main:app --reload --port 8000 &

# Test with custom name
curl -X POST http://localhost:8000/api/versions/deploy \
  -H "Content-Type: application/json" \
  -d '{"version": "1.85.0", "mode": "regular", "isolated_db": false, "name": "test-custom"}'
```

Expected: API accepts request (script will fail if not updated yet, but API should accept the parameter)

**Step 5: Commit**

```bash
git add web-ui/api/versions.py
git commit -m "feat(api): add optional name parameter to deployment endpoint

Supports custom namespace names for multiple deployments of same version.
Parameter is optional - maintains backward compatibility with auto-generated names."
```

---

## Task 2: Deployment Script - Custom Naming Support

Update deployment script to handle custom names with hash-based port calculation.

**Files:**
- Modify: `scripts/deploy-version.sh`

**Step 1: Read current deployment script**

```bash
cat scripts/deploy-version.sh | head -50
```

Expected: See current parameter parsing and namespace generation logic

**Step 2: Add --name parameter parsing**

Add after existing parameter parsing:

```bash
CUSTOM_NAME=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --name)
      CUSTOM_NAME="$2"
      shift 2
      ;;
    # ... existing parameters
  esac
done
```

**Step 3: Add conditional namespace logic**

Replace current namespace generation with:

```bash
if [ -n "$CUSTOM_NAME" ]; then
  NAMESPACE="$CUSTOM_NAME"
  RELEASE_NAME="$CUSTOM_NAME"

  # Hash-based port for custom names (CRC32 mod 1000 + 30000)
  PORT=$(echo -n "$CUSTOM_NAME" | cksum | awk '{print 30000 + ($1 % 1000)}')
else
  # Current auto-generation logic
  NAMESPACE="n8n-v${VERSION_SLUG}"
  RELEASE_NAME="n8n-v${VERSION_SLUG}"
  PORT=$((30000 + (MAJOR * 100) + MINOR))
fi
```

**Step 4: Add namespace validation**

Before creating namespace, check if it already exists:

```bash
if kubectl get namespace "$NAMESPACE" &> /dev/null; then
  echo "ERROR: Namespace '$NAMESPACE' already exists"
  exit 1
fi
```

**Step 5: Test deployment script manually**

```bash
cd /Users/slowik/Desktop/n8n/k8s/.worktrees/web-ui-enhancements

# Test with custom name (dry run to see what would happen)
bash scripts/deploy-version.sh 1.85.0 --regular --name test-acme
```

Expected: Script runs without errors, shows custom namespace and calculated port

**Step 6: Commit**

```bash
git add scripts/deploy-version.sh
git commit -m "feat(deploy): support custom deployment names with hash-based ports

- Add --name parameter for custom namespace names
- Use CRC32 hash mod 1000 for port calculation on custom names
- Validate namespace doesn't already exist before deploying
- Maintain backward compatibility with auto-generated names"
```

---

## Task 3: Parser - Support Custom Namespace Labels

Update parser to extract version from Helm labels for custom namespaces.

**Files:**
- Modify: `web-ui/api/versions.py` (parser function)
- Modify: `helm-chart/templates/_helpers.tpl`

**Step 1: Update Helm chart to add version label**

Read the helpers template:

```bash
cat helm-chart/templates/_helpers.tpl
```

**Step 2: Add version label to helpers**

In `helm-chart/templates/_helpers.tpl`, add to the labels section:

```yaml
{{- define "n8n.labels" -}}
app: n8n
version: {{ .Values.n8nVersion | quote }}
{{- end }}
```

**Step 3: Update parser to fall back to label**

In `web-ui/api/versions.py`, find the namespace parsing logic and update:

```python
def parse_deployment_info(namespace: str) -> dict:
    """Extract deployment info from namespace."""

    # Try to extract version from namespace name pattern
    version_match = re.search(r'n8n-v(\d+)-(\d+)-(\d+)', namespace)
    if version_match:
        version = f"{version_match.group(1)}.{version_match.group(2)}.{version_match.group(3)}"
    else:
        # For custom names, fetch version from namespace label
        try:
            result = subprocess.run(
                ["kubectl", "get", "namespace", namespace, "-o", "jsonpath={.metadata.labels.version}"],
                capture_output=True,
                text=True
            )
            version = result.stdout.strip() or "unknown"
        except:
            version = "unknown"

    return {"namespace": namespace, "version": version}
```

**Step 4: Test parser with custom namespace**

```bash
# Create test namespace with version label
kubectl create namespace test-custom-ns
kubectl label namespace test-custom-ns version=1.85.0

# Test parser (via Python)
cd /Users/slowik/Desktop/n8n/k8s/.worktrees/web-ui-enhancements/web-ui
python -c "
from api.versions import parse_deployment_info
info = parse_deployment_info('test-custom-ns')
print(info)
"

# Cleanup
kubectl delete namespace test-custom-ns
```

Expected: Parser extracts version "1.85.0" from namespace label

**Step 5: Commit**

```bash
git add helm-chart/templates/_helpers.tpl web-ui/api/versions.py
git commit -m "feat(parser): extract version from labels for custom namespaces

- Add version label to Helm chart
- Update parser to fall back to label when namespace doesn't match pattern
- Enables custom namespace names to display correct version info"
```

---

## Task 4: Frontend - Custom Deployment Name Input

Add optional name input field to deployment form with validation.

**Files:**
- Modify: `web-ui/frontend/src/components/DeployVersionCard.tsx`
- Modify: `web-ui/frontend/src/lib/api.ts`

**Step 1: Read current deployment card component**

```bash
cat web-ui/frontend/src/components/DeployVersionCard.tsx
```

Expected: See current form with version input, mode radio, isolated_db checkbox

**Step 2: Add name state and validation**

In `DeployVersionCard.tsx`, add state after existing state:

```typescript
const [name, setName] = React.useState('')
const [nameError, setNameError] = React.useState('')

const validateName = (value: string) => {
  if (!value) {
    setNameError('')
    return true
  }

  // Kubernetes namespace validation
  const valid = /^[a-z0-9-]+$/.test(value) &&
                value.length <= 63 &&
                /^[a-z0-9]/.test(value) &&
                /[a-z0-9]$/.test(value)

  if (!valid) {
    setNameError('Must be lowercase alphanumeric + hyphens, max 63 chars, start/end with alphanumeric')
    return false
  }

  setNameError('')
  return true
}
```

**Step 3: Add name input field to form**

Add after version input, before mode selection:

```tsx
<div className="space-y-2">
  <Label htmlFor="name">Custom Name (optional)</Label>
  <Input
    id="name"
    value={name}
    onChange={(e) => {
      setName(e.target.value)
      validateName(e.target.value)
    }}
    placeholder="Leave blank for auto-generated name"
    className={nameError ? 'border-red-500' : ''}
  />
  {nameError && (
    <p className="text-sm text-red-500">{nameError}</p>
  )}
  <p className="text-xs text-muted-foreground">
    If blank: auto-generates n8n-v{'{version}'}. Custom names enable multiple deployments of same version.
  </p>
</div>
```

**Step 4: Update API call to include name**

Update the mutation call:

```typescript
const deployMutation = useMutation({
  mutationFn: () => api.deployVersion({
    version,
    mode,
    isolated_db: isolatedDb,
    name: name || undefined, // Only send if provided
  }),
  // ... rest
})
```

**Step 5: Update API type definition**

In `web-ui/frontend/src/lib/api.ts`, update the type:

```typescript
interface DeployRequest {
  version: string
  mode: 'queue' | 'regular'
  isolated_db: boolean
  name?: string  // NEW: optional custom name
}
```

**Step 6: Test frontend**

```bash
cd /Users/slowik/Desktop/n8n/k8s/.worktrees/web-ui-enhancements/web-ui/frontend
npm run dev
```

Open http://localhost:5173 and test:
- Leave name blank → should work as before
- Enter "test-custom" → should accept
- Enter "Test-Custom" → should show validation error (uppercase)
- Enter "test_custom" → should show validation error (underscore)

**Step 7: Commit**

```bash
git add web-ui/frontend/src/components/DeployVersionCard.tsx web-ui/frontend/src/lib/api.ts
git commit -m "feat(ui): add custom deployment name input with validation

- Add optional name field to deploy form
- Validate Kubernetes namespace rules (lowercase, alphanumeric+hyphens, 63 chars max)
- Show inline validation errors
- Update API types to include optional name parameter"
```

---

## Task 5: Backend - Manual Snapshot Creation API

Add endpoint to trigger manual database snapshot creation.

**Files:**
- Create: `web-ui/api/snapshots.py` (modify existing)
- Create: `scripts/create-snapshot.sh`

**Step 1: Read existing snapshots API**

```bash
cat web-ui/api/snapshots.py
```

Expected: See existing list and restore endpoints

**Step 2: Add create snapshot endpoint**

Add to `web-ui/api/snapshots.py`:

```python
@router.post("/create")
async def create_snapshot():
    """Create manual database snapshot."""
    try:
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

**Step 3: Create snapshot script**

Create new file `scripts/create-snapshot.sh`:

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

**Step 4: Make script executable**

```bash
chmod +x scripts/create-snapshot.sh
```

**Step 5: Test API endpoint**

```bash
# Test create endpoint
curl -X POST http://localhost:8000/api/snapshots/create
```

Expected: Returns success with job creation message (may fail if k8s not configured, but API should work)

**Step 6: Commit**

```bash
git add web-ui/api/snapshots.py scripts/create-snapshot.sh
git commit -m "feat(api): add manual snapshot creation endpoint

- Add POST /api/snapshots/create endpoint
- Create Kubernetes Job to run pg_dump via create-snapshot.sh script
- Use timestamp-based naming: n8n-{timestamp}-manual.sql
- Return job status and output to frontend"
```

---

## Task 6: Frontend - Manual Snapshot Button

Add "Create Snapshot Now" button to snapshots section.

**Files:**
- Modify: `web-ui/frontend/src/components/SnapshotsSection.tsx`
- Modify: `web-ui/frontend/src/lib/api.ts`

**Step 1: Read current snapshots component**

```bash
cat web-ui/frontend/src/components/SnapshotsSection.tsx
```

Expected: See snapshot list with restore functionality

**Step 2: Add createSnapshot API function**

In `web-ui/frontend/src/lib/api.ts`, add:

```typescript
async createSnapshot() {
  const response = await fetch(`${API_BASE}/api/snapshots/create`, {
    method: 'POST',
  })
  return response.json()
}
```

**Step 3: Add create mutation to component**

In `SnapshotsSection.tsx`, add after existing queries:

```typescript
const createMutation = useMutation({
  mutationFn: () => api.createSnapshot(),
  onSuccess: (data) => {
    if (data.success) {
      toast({
        title: 'Snapshot creation started',
        description: 'Snapshot will appear in list when complete',
      })
      // Refetch to show new snapshot when it appears
      queryClient.invalidateQueries({ queryKey: ['snapshots'] })
    } else {
      toast({
        variant: 'destructive',
        title: 'Failed to create snapshot',
        description: data.error,
      })
    }
  },
  onError: (error) => {
    toast({
      variant: 'destructive',
      title: 'Failed to create snapshot',
      description: error.message,
    })
  },
})
```

**Step 4: Add button to UI**

Add button before the snapshots table:

```tsx
<div className="flex items-center justify-between mb-4">
  <h3 className="text-lg font-semibold">Database Snapshots</h3>
  <Button
    onClick={() => createMutation.mutate()}
    disabled={createMutation.isPending}
  >
    {createMutation.isPending ? 'Creating...' : '📸 Create Snapshot Now'}
  </Button>
</div>
```

**Step 5: Test frontend**

```bash
cd /Users/slowik/Desktop/n8n/k8s/.worktrees/web-ui-enhancements/web-ui/frontend
npm run dev
```

Open http://localhost:5173 and test:
- Click "Create Snapshot Now" → should show loading state
- Should see toast notification when complete
- Snapshot should appear in list (if backend is configured)

**Step 6: Commit**

```bash
git add web-ui/frontend/src/components/SnapshotsSection.tsx web-ui/frontend/src/lib/api.ts
git commit -m "feat(ui): add manual snapshot creation button

- Add 'Create Snapshot Now' button to snapshots section
- Show loading state while creating
- Display toast notification on success/failure
- Auto-refresh snapshot list after creation"
```

---

## Task 7: Backend - GitHub Version Discovery API

Add endpoint to fetch recent n8n releases from GitHub API with caching.

**Files:**
- Create: `web-ui/api/available_versions.py`
- Modify: `web-ui/main.py`

**Step 1: Create available_versions API module**

Create new file `web-ui/api/available_versions.py`:

```python
import requests
from fastapi import APIRouter
from datetime import datetime, timedelta
from typing import List, Dict

router = APIRouter(prefix="/api/versions", tags=["versions"])

# Simple in-memory cache (5 minute TTL)
_cache: Dict[str, any] = {"versions": [], "expires": None}

@router.get("/available")
async def get_available_versions():
    """Fetch recent n8n releases from GitHub API."""
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
            # Extract tag_name, strip 'n8n@' prefix and 'v' prefix
            versions = [
                r["tag_name"].replace("n8n@", "").replace("v", "")
                for r in releases[:20]  # Top 20 releases
                if not r.get("draft", False) and not r.get("prerelease", False)
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

**Step 2: Register router in main.py**

In `web-ui/main.py`, add:

```python
from api import available_versions

app.include_router(available_versions.router)
```

**Step 3: Add requests dependency**

Check if requests is in requirements.txt, if not add it:

```bash
cd /Users/slowik/Desktop/n8n/k8s/.worktrees/web-ui-enhancements/web-ui
grep requests requirements.txt || echo "requests>=2.31.0" >> requirements.txt
pip install requests
```

**Step 4: Test API endpoint**

```bash
# Test available versions endpoint
curl http://localhost:8000/api/versions/available
```

Expected: Returns JSON with array of version strings like `["1.85.0", "1.84.1", ...]`

**Step 5: Test caching**

```bash
# Call twice within 5 minutes - second should be instant (cached)
time curl http://localhost:8000/api/versions/available
sleep 1
time curl http://localhost:8000/api/versions/available
```

Expected: Second call is much faster (no GitHub API call)

**Step 6: Commit**

```bash
git add web-ui/api/available_versions.py web-ui/main.py web-ui/requirements.txt
git commit -m "feat(api): add GitHub version discovery endpoint

- Add GET /api/versions/available to fetch n8n releases from GitHub
- Implement 5-minute in-memory cache to respect rate limits
- Filter out draft and prerelease versions
- Graceful degradation on API failures (return cached or empty)"
```

---

## Task 8: Frontend - GitHub Version Quick-Select Badges

Display recent versions as clickable badges above version input.

**Files:**
- Modify: `web-ui/frontend/src/components/DeployVersionCard.tsx`
- Modify: `web-ui/frontend/src/lib/api.ts`

**Step 1: Add getAvailableVersions API function**

In `web-ui/frontend/src/lib/api.ts`, add:

```typescript
async getAvailableVersions() {
  const response = await fetch(`${API_BASE}/api/versions/available`)
  return response.json()
}
```

**Step 2: Add available versions query to component**

In `DeployVersionCard.tsx`, add after imports:

```typescript
import { Badge } from '@/components/ui/badge'

// Inside component, after existing queries:
const { data: availableVersions } = useQuery({
  queryKey: ['available-versions'],
  queryFn: () => api.getAvailableVersions(),
  staleTime: 5 * 60 * 1000, // 5 minutes
  refetchOnMount: false,
})
```

**Step 3: Add quick-select badges UI**

Add above the version input field:

```tsx
{availableVersions?.versions && availableVersions.versions.length > 0 && (
  <div className="space-y-2">
    <Label className="text-xs text-muted-foreground">Quick select version:</Label>
    <div className="flex gap-2 flex-wrap">
      {availableVersions.versions.slice(0, 8).map((v: string) => (
        <Badge
          key={v}
          variant="outline"
          className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
          onClick={() => setVersion(v)}
        >
          {v}
        </Badge>
      ))}
    </div>
  </div>
)}
```

**Step 4: Ensure Badge component exists**

Check if Badge component is available:

```bash
cat web-ui/frontend/src/components/ui/badge.tsx
```

If not found, create it using shadcn/ui pattern (or skip if already exists).

**Step 5: Test frontend**

```bash
cd /Users/slowik/Desktop/n8n/k8s/.worktrees/web-ui-enhancements/web-ui/frontend
npm run dev
```

Open http://localhost:5173 and test:
- Should see row of version badges (e.g., "1.85.0", "1.84.1", etc.)
- Click a badge → should populate version input field
- Should not re-fetch within 5 minutes (check network tab)

**Step 6: Commit**

```bash
git add web-ui/frontend/src/components/DeployVersionCard.tsx web-ui/frontend/src/lib/api.ts
git commit -m "feat(ui): add GitHub version quick-select badges

- Fetch recent n8n releases from GitHub API
- Display first 8 versions as clickable badges
- Clicking badge populates version input
- Cache results for 5 minutes to minimize API calls"
```

---

## Task 9: Integration Testing & Documentation

Test all three features end-to-end and update README.

**Files:**
- Modify: `README.md`
- Create: `docs/testing-checklist.md`

**Step 1: Manual integration testing**

Test each feature end-to-end:

```bash
# Start full stack
cd /Users/slowik/Desktop/n8n/k8s/.worktrees/web-ui-enhancements/web-ui
docker-compose up -d

# Open browser to http://localhost:8080
```

**Test Custom Naming:**
- [ ] Deploy with blank name → auto-generates `n8n-v{version}`
- [ ] Deploy with custom name "test-acme" → creates namespace `test-acme`
- [ ] Try deploying same custom name twice → shows error
- [ ] Try invalid name "Test-Acme" → shows validation error
- [ ] Custom deployment appears in table with correct info

**Test Manual Snapshots:**
- [ ] Click "Create Snapshot Now" → shows toast notification
- [ ] Snapshot appears in list with timestamp and "manual" in filename
- [ ] Can restore manual snapshot successfully

**Test GitHub Version Discovery:**
- [ ] Version badges appear on page load
- [ ] Click badge → populates version input
- [ ] Reload page within 5 minutes → instant load (cached)
- [ ] Network shows only 1 API call (not per reload)

**Step 2: Create testing checklist document**

Create `docs/testing-checklist.md`:

```markdown
# Web UI Enhancements Testing Checklist

## Custom Deployment Naming

- [ ] Deploy with blank name → auto-generates `n8n-v{version}`
- [ ] Deploy with custom name "acme-prod" → creates namespace `acme-prod`
- [ ] Deploy same version with different names → both succeed
- [ ] Invalid name (uppercase, special chars) → shows validation error
- [ ] Duplicate name → returns error before starting deploy
- [ ] Custom name deployment shows correct info in table
- [ ] Port calculation works for custom names (no conflicts)

## Manual Snapshot Management

- [ ] Click "Create Snapshot Now" → job starts
- [ ] Snapshot appears in list after completion
- [ ] Snapshot file has correct naming: `n8n-{timestamp}-manual.sql`
- [ ] Restore manual snapshot → works correctly
- [ ] Multiple rapid snapshot creates → don't conflict
- [ ] Snapshot creation fails gracefully if postgres unavailable

## GitHub Version Discovery

- [ ] Available versions load on page load
- [ ] Click version badge → fills input field
- [ ] Cache works (no re-fetch within 5 minutes)
- [ ] GitHub API failure → gracefully hides quick-select
- [ ] Version list shows recent releases only (no drafts/prereleases)
```

**Step 3: Update README with new features**

Add to `README.md` under Features section:

```markdown
### New Features (2026-01-19)

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
```

**Step 4: Build and verify frontend**

```bash
cd /Users/slowik/Desktop/n8n/k8s/.worktrees/web-ui-enhancements/web-ui/frontend
npm run build
```

Expected: Build succeeds without errors

**Step 5: Copy to static directory and restart Docker**

```bash
cd /Users/slowik/Desktop/n8n/k8s/.worktrees/web-ui-enhancements/web-ui
rm -rf static
cp -r frontend/dist static
docker-compose down
docker-compose up -d --build
```

**Step 6: Final verification**

Open http://localhost:8080 and verify:
- All three features work as expected
- No console errors
- UI is responsive and styled correctly

**Step 7: Commit**

```bash
git add README.md docs/testing-checklist.md
git commit -m "docs: add testing checklist and update README

- Document all three new features in README
- Create comprehensive testing checklist
- Include manual testing procedures for QA"
```

---

## Post-Implementation

After completing all tasks:

1. Run final integration tests using `docs/testing-checklist.md`
2. Address any issues found during testing
3. Create PR from `feature/web-ui-enhancements` to main
4. Use `superpowers:finishing-a-development-branch` for final cleanup

---

## Testing Commands Reference

```bash
# Start backend
cd web-ui && python -m uvicorn main:app --reload --port 8000

# Start frontend dev server
cd web-ui/frontend && npm run dev

# Build frontend for production
cd web-ui/frontend && npm run build

# Start full stack (Docker)
cd web-ui && docker-compose up -d

# View logs
docker-compose logs -f web-ui

# Run linter
cd web-ui/frontend && npm run lint

# Check TypeScript
cd web-ui/frontend && npm run type-check
```
