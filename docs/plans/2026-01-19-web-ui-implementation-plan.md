# n8n Version Manager Web UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Docker-based web UI for managing n8n version deployments on local Kubernetes cluster

**Architecture:** Single Docker container with FastAPI backend serving static React frontend. Backend calls existing bash scripts via subprocess to reuse tested logic. Frontend polls for updates and provides visual feedback.

**Tech Stack:** Vite, React 18, shadcn/ui, Tailwind CSS, Python 3.11, FastAPI, Docker

---

## Task 1: Project Structure Setup

**Files:**
- Create: `web-ui/requirements.txt`
- Create: `web-ui/main.py`
- Create: `web-ui/api/__init__.py`

**Step 1: Create web-ui directory and requirements.txt**

```bash
mkdir -p web-ui/api
cd web-ui
```

Create `web-ui/requirements.txt`:
```
fastapi==0.109.0
uvicorn[standard]==0.27.0
pydantic==2.5.3
```

**Step 2: Create basic FastAPI app**

Create `web-ui/main.py`:
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="n8n Version Manager API")

# CORS middleware for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
async def health_check():
    return {"status": "ok"}
```

Create `web-ui/api/__init__.py` (empty file for now)

**Step 3: Test backend starts**

Run: `cd web-ui && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt && uvicorn main:app --reload --port 8080`

Expected: Server starts on http://127.0.0.1:8080

Test: `curl http://localhost:8080/api/health`
Expected: `{"status":"ok"}`

**Step 4: Commit**

```bash
git add web-ui/
git commit -m "feat(web-ui): initialize FastAPI backend with health check"
```

---

## Task 2: Versions API Endpoint

**Files:**
- Create: `web-ui/api/versions.py`
- Modify: `web-ui/main.py`

**Step 1: Create versions API module**

Create `web-ui/api/versions.py`:
```python
import subprocess
import re
from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/versions", tags=["versions"])


class DeployRequest(BaseModel):
    version: str
    mode: str  # "queue" or "regular"
    isolated_db: bool = False


def parse_versions_output(output: str) -> List[Dict[str, Any]]:
    """Parse list-versions.sh output into structured JSON."""
    versions = []
    lines = output.strip().split('\n')

    for line in lines:
        # Skip header and separator lines
        if 'NAMESPACE' in line or '---' in line or not line.strip():
            continue

        # Parse format: n8n-v1-85-0  queue    Running  4/4   http://localhost:30185
        parts = line.split()
        if len(parts) >= 4:
            namespace = parts[0]
            mode = parts[1]
            status = parts[2]
            pods = parts[3]
            url = parts[4] if len(parts) > 4 else ""

            # Extract version from namespace (n8n-v1-85-0 -> 1.85.0)
            version_match = re.search(r'n8n-v(\d+)-(\d+)-(\d+)', namespace)
            if version_match:
                version = f"{version_match.group(1)}.{version_match.group(2)}.{version_match.group(3)}"

                # Parse pods (4/4 -> ready=4, total=4)
                pod_parts = pods.split('/')
                pods_ready = int(pod_parts[0]) if len(pod_parts) > 0 else 0
                pods_total = int(pod_parts[1]) if len(pod_parts) > 1 else 0

                versions.append({
                    "version": version,
                    "namespace": namespace,
                    "mode": mode.lower(),
                    "status": status.lower(),
                    "pods": {
                        "ready": pods_ready,
                        "total": pods_total
                    },
                    "url": url
                })

    return versions


@router.get("")
async def list_versions():
    """List all deployed n8n versions."""
    try:
        result = subprocess.run(
            ["/workspace/scripts/list-versions.sh"],
            capture_output=True,
            text=True,
            cwd="/workspace"
        )

        if result.returncode != 0:
            raise HTTPException(status_code=500, detail=f"Failed to list versions: {result.stderr}")

        versions = parse_versions_output(result.stdout)
        return {"versions": versions}

    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="list-versions.sh script not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("")
async def deploy_version(request: DeployRequest):
    """Deploy a new n8n version."""
    try:
        mode_flag = "--queue" if request.mode == "queue" else "--regular"
        cmd = ["/workspace/scripts/deploy-version.sh", request.version, mode_flag]

        if request.isolated_db:
            cmd.append("--isolated-db")

        result = subprocess.run(cmd, capture_output=True, text=True, cwd="/workspace")

        if result.returncode != 0:
            return {
                "success": False,
                "message": "Deployment failed",
                "error": result.stderr,
                "output": result.stdout
            }

        # Calculate namespace and URL from version
        namespace = f"n8n-v{request.version.replace('.', '-')}"
        version_parts = request.version.split('.')
        port = 30000 + (int(version_parts[0]) * 100) + int(version_parts[1])
        url = f"http://localhost:{port}"

        return {
            "success": True,
            "message": "Deployment initiated",
            "namespace": namespace,
            "url": url,
            "output": result.stdout
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{version}")
async def remove_version(version: str):
    """Remove a deployed n8n version."""
    try:
        result = subprocess.run(
            ["/workspace/scripts/remove-version.sh", version],
            capture_output=True,
            text=True,
            cwd="/workspace"
        )

        if result.returncode != 0:
            return {
                "success": False,
                "message": "Removal failed",
                "error": result.stderr,
                "output": result.stdout
            }

        return {
            "success": True,
            "message": f"Version {version} removed",
            "output": result.stdout
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

**Step 2: Register versions router in main.py**

Modify `web-ui/main.py`, add after app creation:
```python
from api.versions import router as versions_router

app.include_router(versions_router)
```

**Step 3: Test versions endpoints**

Run: `uvicorn main:app --reload --port 8080`

Test list (should work even without k8s): `curl http://localhost:8080/api/versions`
Expected: JSON response with versions array (may be empty)

Test health: `curl http://localhost:8080/api/health`
Expected: `{"status":"ok"}`

**Step 4: Commit**

```bash
git add web-ui/
git commit -m "feat(web-ui): add versions API endpoints (list, deploy, remove)"
```

---

## Task 3: Snapshots and Infrastructure APIs

**Files:**
- Create: `web-ui/api/snapshots.py`
- Create: `web-ui/api/infrastructure.py`
- Modify: `web-ui/main.py`

**Step 1: Create snapshots API**

Create `web-ui/api/snapshots.py`:
```python
import subprocess
import re
from datetime import datetime
from typing import List, Dict
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/snapshots", tags=["snapshots"])


class RestoreRequest(BaseModel):
    snapshot: str


def parse_snapshots_output(output: str) -> List[Dict[str, str]]:
    """Parse list-snapshots.sh output into structured JSON."""
    snapshots = []
    lines = output.strip().split('\n')

    for line in lines:
        if line.strip() and line.endswith('.sql'):
            filename = line.strip()

            # Parse timestamp from filename: n8n-20260119-181411-pre-v2.1.0.sql
            timestamp_match = re.search(r'n8n-(\d{8})-(\d{6})', filename)
            if timestamp_match:
                date_str = timestamp_match.group(1)
                time_str = timestamp_match.group(2)
                # Format: YYYYMMDD-HHMMSS -> YYYY-MM-DD HH:MM:SS
                timestamp = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:8]} {time_str[:2]}:{time_str[2:4]}:{time_str[4:6]}"
            else:
                timestamp = "Unknown"

            snapshots.append({
                "filename": filename,
                "timestamp": timestamp
            })

    return snapshots


@router.get("")
async def list_snapshots():
    """List all database snapshots."""
    try:
        result = subprocess.run(
            ["/workspace/scripts/list-snapshots.sh"],
            capture_output=True,
            text=True,
            cwd="/workspace"
        )

        if result.returncode != 0:
            raise HTTPException(status_code=500, detail=f"Failed to list snapshots: {result.stderr}")

        snapshots = parse_snapshots_output(result.stdout)
        return {"snapshots": snapshots}

    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="list-snapshots.sh script not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/restore")
async def restore_snapshot(request: RestoreRequest):
    """Restore database from snapshot."""
    try:
        result = subprocess.run(
            ["/workspace/scripts/restore-snapshot.sh", request.snapshot],
            capture_output=True,
            text=True,
            cwd="/workspace",
            input="yes\n"  # Auto-confirm the restore
        )

        if result.returncode != 0:
            return {
                "success": False,
                "message": "Restore failed",
                "error": result.stderr,
                "output": result.stdout
            }

        return {
            "success": True,
            "message": f"Snapshot {request.snapshot} restored",
            "output": result.stdout
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

**Step 2: Create infrastructure API**

Create `web-ui/api/infrastructure.py`:
```python
import subprocess
from fastapi import APIRouter

router = APIRouter(prefix="/api/infrastructure", tags=["infrastructure"])


@router.get("/status")
async def get_infrastructure_status():
    """Check PostgreSQL and Redis health."""
    postgres_healthy = False
    redis_healthy = False

    try:
        # Check Postgres pod
        result = subprocess.run(
            ["kubectl", "get", "pods", "-n", "n8n-system", "-l", "app=postgres", "-o", "jsonpath={.items[0].status.phase}"],
            capture_output=True,
            text=True
        )
        postgres_healthy = result.returncode == 0 and result.stdout.strip() == "Running"
    except:
        pass

    try:
        # Check Redis pod
        result = subprocess.run(
            ["kubectl", "get", "pods", "-n", "n8n-system", "-l", "app=redis", "-o", "jsonpath={.items[0].status.phase}"],
            capture_output=True,
            text=True
        )
        redis_healthy = result.returncode == 0 and result.stdout.strip() == "Running"
    except:
        pass

    return {
        "postgres": {
            "healthy": postgres_healthy,
            "status": "running" if postgres_healthy else "unavailable"
        },
        "redis": {
            "healthy": redis_healthy,
            "status": "running" if redis_healthy else "unavailable"
        }
    }
```

**Step 3: Register routers in main.py**

Modify `web-ui/main.py`, add after versions router:
```python
from api.snapshots import router as snapshots_router
from api.infrastructure import router as infrastructure_router

app.include_router(snapshots_router)
app.include_router(infrastructure_router)
```

**Step 4: Test new endpoints**

Run: `uvicorn main:app --reload --port 8080`

Test snapshots: `curl http://localhost:8080/api/snapshots`
Test infrastructure: `curl http://localhost:8080/api/infrastructure/status`

Expected: JSON responses (may have empty arrays or unhealthy status without k8s)

**Step 5: Commit**

```bash
git add web-ui/
git commit -m "feat(web-ui): add snapshots and infrastructure status APIs"
```

---

## Task 4: Frontend Project Setup

**Files:**
- Create: `web-ui/frontend/package.json`
- Create: `web-ui/frontend/index.html`
- Create: `web-ui/frontend/vite.config.ts`
- Create: `web-ui/frontend/tailwind.config.js`
- Create: `web-ui/frontend/tsconfig.json`
- Create: `web-ui/frontend/src/main.tsx`
- Create: `web-ui/frontend/src/App.tsx`
- Create: `web-ui/frontend/src/index.css`

**Step 1: Initialize frontend with Vite**

```bash
cd web-ui
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
```

**Step 2: Install dependencies**

```bash
npm install @tanstack/react-query
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

**Step 3: Configure Vite proxy**

Modify `web-ui/frontend/vite.config.ts`:
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
```

**Step 4: Configure Tailwind**

Modify `web-ui/frontend/tailwind.config.js`:
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

**Step 5: Setup basic App structure**

Create `web-ui/frontend/src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

Modify `web-ui/frontend/src/main.tsx`:
```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App.tsx'
import './index.css'

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
)
```

Modify `web-ui/frontend/src/App.tsx`:
```typescript
function App() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          n8n Version Manager
        </h1>
        <p className="text-gray-600">Frontend initialized</p>
      </div>
    </div>
  )
}

export default App
```

**Step 6: Test frontend starts**

Run: `npm run dev`
Expected: Vite dev server starts on http://localhost:5173

Open browser: http://localhost:5173
Expected: Page shows "n8n Version Manager" heading

**Step 7: Commit**

```bash
git add web-ui/frontend/
git commit -m "feat(web-ui): initialize Vite + React + Tailwind frontend"
```

---

## Task 5: shadcn/ui Setup

**Files:**
- Create: `web-ui/frontend/components.json`
- Create: `web-ui/frontend/src/lib/utils.ts`
- Create: `web-ui/frontend/src/components/ui/` (multiple component files)

**Step 1: Initialize shadcn/ui**

```bash
cd web-ui/frontend
npx shadcn-ui@latest init
```

When prompted:
- Style: Default
- Base color: Slate
- CSS variables: Yes

**Step 2: Install required shadcn components**

```bash
npx shadcn-ui@latest add button
npx shadcn-ui@latest add card
npx shadcn-ui@latest add input
npx shadcn-ui@latest add label
npx shadcn-ui@latest add radio-group
npx shadcn-ui@latest add checkbox
npx shadcn-ui@latest add table
npx shadcn-ui@latest add badge
npx shadcn-ui@latest add accordion
npx shadcn-ui@latest add alert-dialog
npx shadcn-ui@latest add toast
npx shadcn-ui@latest add skeleton
```

**Step 3: Verify shadcn components installed**

Run: `ls src/components/ui/`
Expected: List of .tsx files (button.tsx, card.tsx, input.tsx, etc.)

**Step 4: Test a shadcn component**

Modify `web-ui/frontend/src/App.tsx`:
```typescript
import { Button } from './components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from './components/ui/card'

function App() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          n8n Version Manager
        </h1>
        <Card>
          <CardHeader>
            <CardTitle>Test Card</CardTitle>
          </CardHeader>
          <CardContent>
            <Button>Test Button</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default App
```

**Step 5: Verify in browser**

Run: `npm run dev`
Open: http://localhost:5173
Expected: Styled card with button visible

**Step 6: Commit**

```bash
git add web-ui/frontend/
git commit -m "feat(web-ui): install and configure shadcn/ui components"
```

---

## Task 6: API Client Layer

**Files:**
- Create: `web-ui/frontend/src/lib/api.ts`
- Create: `web-ui/frontend/src/lib/types.ts`

**Step 1: Define TypeScript types**

Create `web-ui/frontend/src/lib/types.ts`:
```typescript
export interface Version {
  version: string
  namespace: string
  mode: 'queue' | 'regular'
  status: 'running' | 'pending' | 'failed'
  pods: {
    ready: number
    total: number
  }
  url: string
}

export interface Snapshot {
  filename: string
  timestamp: string
}

export interface Infrastructure {
  postgres: {
    healthy: boolean
    status: string
  }
  redis: {
    healthy: boolean
    status: string
  }
}

export interface DeployRequest {
  version: string
  mode: 'queue' | 'regular'
  isolated_db: boolean
}

export interface ApiResponse<T = any> {
  success?: boolean
  message?: string
  error?: string
  output?: string
  data?: T
}
```

**Step 2: Create API client**

Create `web-ui/frontend/src/lib/api.ts`:
```typescript
import type { Version, Snapshot, Infrastructure, DeployRequest, ApiResponse } from './types'

const API_BASE = '/api'

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }

  return response.json()
}

export const api = {
  // Version management
  listVersions: async (): Promise<{ versions: Version[] }> => {
    return fetchJson(`${API_BASE}/versions`)
  },

  deployVersion: async (request: DeployRequest): Promise<ApiResponse> => {
    return fetchJson(`${API_BASE}/versions`, {
      method: 'POST',
      body: JSON.stringify(request),
    })
  },

  removeVersion: async (version: string): Promise<ApiResponse> => {
    return fetchJson(`${API_BASE}/versions/${version}`, {
      method: 'DELETE',
    })
  },

  // Snapshot management
  listSnapshots: async (): Promise<{ snapshots: Snapshot[] }> => {
    return fetchJson(`${API_BASE}/snapshots`)
  },

  restoreSnapshot: async (snapshot: string): Promise<ApiResponse> => {
    return fetchJson(`${API_BASE}/snapshots/restore`, {
      method: 'POST',
      body: JSON.stringify({ snapshot }),
    })
  },

  // Infrastructure
  getInfrastructureStatus: async (): Promise<Infrastructure> => {
    return fetchJson(`${API_BASE}/infrastructure/status`)
  },

  // Health check
  healthCheck: async (): Promise<{ status: string }> => {
    return fetchJson(`${API_BASE}/health`)
  },
}
```

**Step 3: Test API client types compile**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors

**Step 4: Commit**

```bash
git add web-ui/frontend/src/lib/
git commit -m "feat(web-ui): add API client layer with TypeScript types"
```

---

## Task 7: Header Component

**Files:**
- Create: `web-ui/frontend/src/components/Header.tsx`
- Modify: `web-ui/frontend/src/App.tsx`

**Step 1: Create Header component**

Create `web-ui/frontend/src/components/Header.tsx`:
```typescript
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Badge } from './ui/badge'

export function Header() {
  const { data: infrastructure } = useQuery({
    queryKey: ['infrastructure'],
    queryFn: api.getInfrastructureStatus,
    refetchInterval: 5000, // Poll every 5 seconds
  })

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            n8n Version Manager
          </h1>
          <p className="text-gray-600 mt-1">
            Quick version switching for local Kubernetes
          </p>
        </div>

        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Postgres:</span>
            <Badge variant={infrastructure?.postgres.healthy ? 'default' : 'destructive'}>
              {infrastructure?.postgres.healthy ? '✓' : '✗'}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Redis:</span>
            <Badge variant={infrastructure?.redis.healthy ? 'default' : 'destructive'}>
              {infrastructure?.redis.healthy ? '✓' : '✗'}
            </Badge>
          </div>
        </div>
      </div>

      {infrastructure && (!infrastructure.postgres.healthy || !infrastructure.redis.healthy) && (
        <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
          <p className="text-sm text-yellow-800">
            ⚠️ Infrastructure unavailable. Postgres or Redis not ready.
          </p>
        </div>
      )}
    </div>
  )
}
```

**Step 2: Update App to use Header**

Modify `web-ui/frontend/src/App.tsx`:
```typescript
import { Header } from './components/Header'

function App() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <Header />
        <p className="text-gray-600">Components will go here</p>
      </div>
    </div>
  )
}

export default App
```

**Step 3: Test in browser**

Run: `npm run dev`
Open: http://localhost:5173
Expected: Header with infrastructure status badges visible

**Step 4: Commit**

```bash
git add web-ui/frontend/
git commit -m "feat(web-ui): add Header component with infrastructure status"
```

---

## Task 8: Deploy Version Card Component

**Files:**
- Create: `web-ui/frontend/src/components/DeployVersionCard.tsx`
- Modify: `web-ui/frontend/src/App.tsx`

**Step 1: Create DeployVersionCard component**

Create `web-ui/frontend/src/components/DeployVersionCard.tsx`:
```typescript
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card, CardHeader, CardTitle, CardContent } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Button } from './ui/button'
import { RadioGroup, RadioGroupItem } from './ui/radio-group'
import { Checkbox } from './ui/checkbox'
import { useToast } from './ui/use-toast'

export function DeployVersionCard() {
  const [version, setVersion] = useState('')
  const [mode, setMode] = useState<'queue' | 'regular'>('queue')
  const [isolatedDb, setIsolatedDb] = useState(false)

  const { toast } = useToast()
  const queryClient = useQueryClient()

  const deployMutation = useMutation({
    mutationFn: () => api.deployVersion({ version, mode, isolated_db: isolatedDb }),
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: 'Deployment initiated',
          description: `n8n ${version} is being deployed`,
        })
        setVersion('')
        queryClient.invalidateQueries({ queryKey: ['versions'] })
      } else {
        toast({
          variant: 'destructive',
          title: 'Deployment failed',
          description: data.error || 'Unknown error',
        })
      }
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Deployment failed',
        description: error.message,
      })
    },
  })

  const handleDeploy = () => {
    if (!version) {
      toast({
        variant: 'destructive',
        title: 'Version required',
        description: 'Please enter a version number',
      })
      return
    }
    deployMutation.mutate()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Deploy New Version</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="version">Version</Label>
          <Input
            id="version"
            placeholder="1.90.0"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            disabled={deployMutation.isPending}
          />
        </div>

        <div>
          <Label>Mode</Label>
          <RadioGroup value={mode} onValueChange={(v) => setMode(v as 'queue' | 'regular')}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="queue" id="queue" />
              <Label htmlFor="queue" className="font-normal">Queue (with workers)</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="regular" id="regular" />
              <Label htmlFor="regular" className="font-normal">Regular (single process)</Label>
            </div>
          </RadioGroup>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="isolated-db"
            checked={isolatedDb}
            onCheckedChange={(checked) => setIsolatedDb(checked as boolean)}
          />
          <Label htmlFor="isolated-db" className="font-normal">
            Isolated Database
          </Label>
        </div>

        <Button
          onClick={handleDeploy}
          disabled={deployMutation.isPending}
          className="w-full"
        >
          {deployMutation.isPending ? 'Deploying...' : 'Deploy'}
        </Button>
      </CardContent>
    </Card>
  )
}
```

**Step 2: Add Toaster to App**

Modify `web-ui/frontend/src/App.tsx`:
```typescript
import { Header } from './components/Header'
import { DeployVersionCard } from './components/DeployVersionCard'
import { Toaster } from './components/ui/toaster'

function App() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <Header />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <DeployVersionCard />
          </div>
          <div className="lg:col-span-2">
            <p className="text-gray-600">Versions table will go here</p>
          </div>
        </div>
      </div>
      <Toaster />
    </div>
  )
}

export default App
```

**Step 3: Test in browser**

Run: `npm run dev`
Open: http://localhost:5173
Expected: Deploy card with version input, mode selector, isolated DB checkbox, and deploy button

**Step 4: Commit**

```bash
git add web-ui/frontend/
git commit -m "feat(web-ui): add DeployVersionCard component with form and toast notifications"
```

---

## Task 9: Versions Table Component

**Files:**
- Create: `web-ui/frontend/src/components/VersionsTable.tsx`
- Modify: `web-ui/frontend/src/App.tsx`

**Step 1: Create VersionsTable component**

Create `web-ui/frontend/src/components/VersionsTable.tsx`:
```typescript
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Version } from '@/lib/types'
import { Card, CardHeader, CardTitle, CardContent } from './ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui/table'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog'
import { Skeleton } from './ui/skeleton'
import { useToast } from './ui/use-toast'

export function VersionsTable() {
  const [deleteVersion, setDeleteVersion] = useState<string | null>(null)
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['versions'],
    queryFn: api.listVersions,
    refetchInterval: 5000, // Poll every 5 seconds
  })

  const removeMutation = useMutation({
    mutationFn: (version: string) => api.removeVersion(version),
    onSuccess: (data, version) => {
      if (data.success) {
        toast({
          title: 'Version removed',
          description: `n8n ${version} has been removed`,
        })
        queryClient.invalidateQueries({ queryKey: ['versions'] })
      } else {
        toast({
          variant: 'destructive',
          title: 'Removal failed',
          description: data.error || 'Unknown error',
        })
      }
      setDeleteVersion(null)
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Removal failed',
        description: error.message,
      })
      setDeleteVersion(null)
    },
  })

  const getStatusVariant = (status: string) => {
    if (status === 'running') return 'default'
    if (status === 'pending') return 'secondary'
    return 'destructive'
  }

  const getModeVariant = (mode: string) => {
    return mode === 'queue' ? 'default' : 'secondary'
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Active Versions</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Version</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Pods</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.versions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-gray-500">
                      No versions deployed
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.versions.map((version: Version) => (
                    <TableRow key={version.namespace}>
                      <TableCell className="font-medium">{version.version}</TableCell>
                      <TableCell>
                        <Badge variant={getModeVariant(version.mode)}>
                          {version.mode}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(version.status)}>
                          {version.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {version.pods.ready}/{version.pods.total}
                      </TableCell>
                      <TableCell>
                        {version.url && (
                          <a
                            href={version.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            →
                          </a>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setDeleteVersion(version.version)}
                          disabled={removeMutation.isPending}
                        >
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteVersion} onOpenChange={() => setDeleteVersion(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete n8n version {deleteVersion}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the namespace and all pods. Database data will remain.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteVersion && removeMutation.mutate(deleteVersion)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
```

**Step 2: Update App to use VersionsTable**

Modify `web-ui/frontend/src/App.tsx`:
```typescript
import { Header } from './components/Header'
import { DeployVersionCard } from './components/DeployVersionCard'
import { VersionsTable } from './components/VersionsTable'
import { Toaster } from './components/ui/toaster'

function App() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <Header />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <DeployVersionCard />
          </div>
          <div className="lg:col-span-2">
            <VersionsTable />
          </div>
        </div>
      </div>
      <Toaster />
    </div>
  )
}

export default App
```

**Step 3: Test in browser**

Run: `npm run dev`
Open: http://localhost:5173
Expected: Versions table with columns, loading skeleton, delete confirmation dialog

**Step 4: Commit**

```bash
git add web-ui/frontend/
git commit -m "feat(web-ui): add VersionsTable component with delete confirmation"
```

---

## Task 10: Snapshots Section Component

**Files:**
- Create: `web-ui/frontend/src/components/SnapshotsSection.tsx`
- Modify: `web-ui/frontend/src/App.tsx`

**Step 1: Create SnapshotsSection component**

Create `web-ui/frontend/src/components/SnapshotsSection.tsx`:
```typescript
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Snapshot } from '@/lib/types'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from './ui/accordion'
import { Button } from './ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog'
import { useToast } from './ui/use-toast'

export function SnapshotsSection() {
  const [restoreSnapshot, setRestoreSnapshot] = useState<string | null>(null)
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: ['snapshots'],
    queryFn: api.listSnapshots,
    refetchInterval: 10000, // Poll every 10 seconds
  })

  const restoreMutation = useMutation({
    mutationFn: (snapshot: string) => api.restoreSnapshot(snapshot),
    onSuccess: (data, snapshot) => {
      if (data.success) {
        toast({
          title: 'Snapshot restored',
          description: `Database restored from ${snapshot}`,
        })
        queryClient.invalidateQueries({ queryKey: ['versions'] })
      } else {
        toast({
          variant: 'destructive',
          title: 'Restore failed',
          description: data.error || 'Unknown error',
        })
      }
      setRestoreSnapshot(null)
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Restore failed',
        description: error.message,
      })
      setRestoreSnapshot(null)
    },
  })

  const snapshotCount = data?.snapshots.length || 0

  return (
    <>
      <Accordion type="single" collapsible className="mt-8">
        <AccordionItem value="snapshots">
          <AccordionTrigger>
            Database Snapshots ({snapshotCount})
          </AccordionTrigger>
          <AccordionContent>
            {snapshotCount === 0 ? (
              <p className="text-gray-500 text-sm">No snapshots available</p>
            ) : (
              <div className="space-y-2">
                {data?.snapshots.map((snapshot: Snapshot) => (
                  <div
                    key={snapshot.filename}
                    className="flex items-center justify-between p-3 bg-white border rounded-md"
                  >
                    <div>
                      <p className="font-medium text-sm">{snapshot.filename}</p>
                      <p className="text-xs text-gray-500">{snapshot.timestamp}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRestoreSnapshot(snapshot.filename)}
                      disabled={restoreMutation.isPending}
                    >
                      Restore
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <AlertDialog open={!!restoreSnapshot} onOpenChange={() => setRestoreSnapshot(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore snapshot?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>This will OVERWRITE the current database with:</p>
              <p className="font-mono text-sm bg-gray-100 p-2 rounded">{restoreSnapshot}</p>
              <p className="text-red-600 font-medium">
                All current data will be replaced. This cannot be undone.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => restoreSnapshot && restoreMutation.mutate(restoreSnapshot)}
              className="bg-red-600 hover:bg-red-700"
            >
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
```

**Step 2: Update App to use SnapshotsSection**

Modify `web-ui/frontend/src/App.tsx`:
```typescript
import { Header } from './components/Header'
import { DeployVersionCard } from './components/DeployVersionCard'
import { VersionsTable } from './components/VersionsTable'
import { SnapshotsSection } from './components/SnapshotsSection'
import { Toaster } from './components/ui/toaster'

function App() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <Header />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <DeployVersionCard />
          </div>
          <div className="lg:col-span-2">
            <VersionsTable />
          </div>
        </div>
        <SnapshotsSection />
      </div>
      <Toaster />
    </div>
  )
}

export default App
```

**Step 3: Test in browser**

Run: `npm run dev`
Open: http://localhost:5173
Expected: Collapsible snapshots section below main content, restore confirmation dialog

**Step 4: Commit**

```bash
git add web-ui/frontend/
git commit -m "feat(web-ui): add SnapshotsSection component with restore confirmation"
```

---

## Task 11: Dockerfile and Build Setup

**Files:**
- Create: `web-ui/Dockerfile`
- Create: `web-ui/.dockerignore`
- Modify: `web-ui/main.py` (add static file serving)

**Step 1: Create .dockerignore**

Create `web-ui/.dockerignore`:
```
frontend/node_modules
frontend/dist
venv
__pycache__
*.pyc
.git
.gitignore
README.md
```

**Step 2: Create Dockerfile**

Create `web-ui/Dockerfile`:
```dockerfile
FROM node:18-alpine AS frontend-builder

WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.11-slim

# Install kubectl and helm
RUN apt-get update && apt-get install -y curl && \
    curl -LO https://dl.k8s.io/release/v1.28.0/bin/linux/amd64/kubectl && \
    chmod +x kubectl && mv kubectl /usr/local/bin/ && \
    curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY main.py .
COPY api/ ./api/

# Copy built frontend
COPY --from=frontend-builder /frontend/dist ./static

EXPOSE 8080

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
```

**Step 3: Add static file serving to main.py**

Modify `web-ui/main.py`, add at the end before app definition:
```python
from fastapi.staticfiles import StaticFiles
import os

# Register API routers first
from api.versions import router as versions_router
from api.snapshots import router as snapshots_router
from api.infrastructure import router as infrastructure_router

app.include_router(versions_router)
app.include_router(snapshots_router)
app.include_router(infrastructure_router)

# Serve static files (must be last)
if os.path.exists("static"):
    app.mount("/", StaticFiles(directory="static", html=True), name="static")
```

**Step 4: Build Docker image**

Run: `cd web-ui && docker build -t n8n-version-ui .`
Expected: Build succeeds, image created

**Step 5: Commit**

```bash
git add web-ui/
git commit -m "feat(web-ui): add Dockerfile and static file serving"
```

---

## Task 12: Docker Testing and Documentation

**Files:**
- Create: `web-ui/README.md`
- Create: `web-ui/docker-compose.yml`

**Step 1: Create docker-compose.yml**

Create `web-ui/docker-compose.yml`:
```yaml
version: '3.8'

services:
  n8n-ui:
    build: .
    container_name: n8n-ui
    network_mode: host
    ports:
      - "8080:8080"
    volumes:
      - ~/.kube/config:/root/.kube/config:ro
      - ../:/workspace:ro
    restart: unless-stopped
```

**Step 2: Create README**

Create `web-ui/README.md`:
```markdown
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

\`\`\`bash
cd web-ui
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8080
\`\`\`

### Frontend

\`\`\`bash
cd frontend
npm install
npm run dev
\`\`\`

Frontend runs on http://localhost:5173 and proxies API calls to http://localhost:8080

## Production (Docker)

### Build

\`\`\`bash
docker build -t n8n-version-ui .
\`\`\`

### Run

\`\`\`bash
docker run -d \
  --name n8n-ui \
  --network host \
  -v ~/.kube/config:/root/.kube/config:ro \
  -v $(pwd)/..:/workspace:ro \
  -p 8080:8080 \
  n8n-version-ui
\`\`\`

Or use docker-compose:

\`\`\`bash
docker-compose up -d
\`\`\`

### Access

Open http://localhost:8080

## Architecture

- **Frontend**: Vite + React + shadcn/ui (compiled to static files)
- **Backend**: Python FastAPI server
- **Container**: Single Docker image with both frontend and backend
- **Scripts**: Reuses existing bash scripts via subprocess calls

## API Endpoints

- \`GET /api/versions\` - List deployed versions
- \`POST /api/versions\` - Deploy new version
- \`DELETE /api/versions/{version}\` - Remove version
- \`GET /api/snapshots\` - List database snapshots
- \`POST /api/snapshots/restore\` - Restore from snapshot
- \`GET /api/infrastructure/status\` - Check Postgres/Redis health

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, React Query
- **Backend**: Python 3.11, FastAPI, Uvicorn
- **Container**: Docker multi-stage build
```

**Step 3: Test Docker build and run**

Run:
```bash
cd web-ui
docker build -t n8n-version-ui .
```

Expected: Build succeeds

Run:
```bash
docker run -d \
  --name n8n-ui-test \
  --network host \
  -v ~/.kube/config:/root/.kube/config:ro \
  -v $(pwd)/..:/workspace:ro \
  -p 8080:8080 \
  n8n-version-ui
```

Expected: Container starts

Test: Open http://localhost:8080
Expected: Web UI loads and shows dashboard

Cleanup: `docker stop n8n-ui-test && docker rm n8n-ui-test`

**Step 4: Commit**

```bash
git add web-ui/
git commit -m "feat(web-ui): add docker-compose and README documentation"
```

---

## Task 13: Integration Testing

**Files:**
- Update: `README.md` (add web UI section)

**Step 1: Update main README with web UI instructions**

Modify `README.md`, add section after "Helper Scripts":

```markdown
## Web UI

### Quick Start

\`\`\`bash
cd web-ui
docker-compose up -d
\`\`\`

Access the web UI at http://localhost:8080

### Features

- **Deploy versions**: Enter version number, select mode, click Deploy
- **View active versions**: Real-time status updates every 5 seconds
- **Remove versions**: Click Delete with confirmation dialog
- **Manage snapshots**: Expand snapshots section, restore with confirmation
- **Infrastructure status**: Monitor Postgres and Redis health in header

### Development Mode

See [web-ui/README.md](web-ui/README.md) for development setup.

### Stopping the UI

\`\`\`bash
cd web-ui
docker-compose down
\`\`\`
```

**Step 2: End-to-end test with actual deployment**

Prerequisites: Infrastructure must be deployed

Test sequence:
1. Start web UI: `cd web-ui && docker-compose up -d`
2. Open http://localhost:8080
3. Verify infrastructure status shows green badges
4. Deploy version 1.87.0 in queue mode
5. Wait for version to appear in table
6. Verify status changes from pending to running
7. Click URL link, verify n8n opens
8. Click Delete, confirm, verify version removed
9. Check snapshots section has entries
10. Stop UI: `docker-compose down`

Run through this sequence manually.

Expected: All operations work end-to-end

**Step 3: Commit README update**

```bash
git add README.md
git commit -m "docs: add web UI section to main README"
```

---

## Success Criteria

- ✅ Web UI accessible at http://localhost:8080
- ✅ Can deploy n8n version via UI (2 clicks: enter version + deploy)
- ✅ Versions table shows all active deployments with real-time updates
- ✅ Can delete version with confirmation dialog
- ✅ Infrastructure status indicators work (Postgres/Redis)
- ✅ Snapshots section shows available backups
- ✅ Can restore snapshot with confirmation
- ✅ Toast notifications for all operations
- ✅ Docker container runs with mounted kubeconfig and workspace
- ✅ Frontend polls for updates every 5 seconds
- ✅ Error messages are clear and actionable

## Notes

- Web UI reuses existing bash scripts - no reimplementation needed
- Frontend uses React Query for polling and caching
- shadcn/ui provides accessible, styled components
- Docker multi-stage build keeps image size reasonable
- Development mode uses Vite proxy for API calls
