# Custom Values Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to configure custom Helm values (environment variables, resource limits, worker replicas, and raw YAML overrides) when deploying n8n instances.

**Architecture:** Hybrid UI with form inputs for common settings and a raw YAML editor for advanced overrides. Values are passed through the API to a temporary values file used by Helm.

**Tech Stack:** React, TypeScript, TanStack Query, FastAPI, Helm, YAML

---

## Task 1: Add extraEnv Support to Helm Chart

**Files:**
- Modify: `charts/n8n-instance/values.yaml`
- Modify: `charts/n8n-instance/templates/configmap.yaml`

**Step 1: Add extraEnv to values.yaml**

Add at the end of `charts/n8n-instance/values.yaml`:

```yaml
# Extra environment variables (added via UI)
extraEnv: {}
```

**Step 2: Update ConfigMap template**

Add at the end of `charts/n8n-instance/templates/configmap.yaml` (before the final blank line):

```yaml
  {{- if .Values.extraEnv }}
  {{- range $key, $value := .Values.extraEnv }}
  {{ $key }}: {{ $value | quote }}
  {{- end }}
  {{- end }}
```

**Step 3: Verify template renders correctly**

Run: `helm template test-release ./charts/n8n-instance --set extraEnv.N8N_LOG_LEVEL=debug --set extraEnv.CUSTOM_VAR=test`

Expected: ConfigMap should contain:
```yaml
  N8N_LOG_LEVEL: "debug"
  CUSTOM_VAR: "test"
```

**Step 4: Commit**

```bash
git add charts/n8n-instance/values.yaml charts/n8n-instance/templates/configmap.yaml
git commit -m "feat(helm): add extraEnv support for custom environment variables"
```

---

## Task 2: Update TypeScript Types

**Files:**
- Modify: `web-ui-next/lib/types.ts`

**Step 1: Add CustomValues interface**

Add after `NamespaceStatus` interface in `web-ui-next/lib/types.ts`:

```typescript
export interface EnvVar {
  key: string
  value: string
}

export interface CustomValues {
  envVars?: EnvVar[]
  resources?: {
    cpu?: string
    memory?: string
  }
  workerReplicas?: number
  rawYaml?: string
}
```

**Step 2: Update DeployRequest interface**

Modify `DeployRequest` interface to add optional `custom_values` field:

```typescript
export interface DeployRequest {
  version: string
  mode: 'queue' | 'regular'
  isolated_db: boolean
  name?: string
  snapshot?: string
  custom_values?: CustomValues
}
```

**Step 3: Commit**

```bash
git add web-ui-next/lib/types.ts
git commit -m "feat(types): add CustomValues interface for deployment configuration"
```

---

## Task 3: Update Backend to Handle Custom Values

**Files:**
- Modify: `web-ui/api/versions.py`
- Modify: `scripts/deploy-version.sh`

**Step 1: Update DeployRequest model in versions.py**

Update the `DeployRequest` class in `web-ui/api/versions.py`:

```python
from typing import List, Dict, Any, Optional
import tempfile
import yaml
import os

class EnvVar(BaseModel):
    key: str
    value: str

class ResourceConfig(BaseModel):
    cpu: Optional[str] = None
    memory: Optional[str] = None

class CustomValues(BaseModel):
    envVars: Optional[List[EnvVar]] = None
    resources: Optional[ResourceConfig] = None
    workerReplicas: Optional[int] = None
    rawYaml: Optional[str] = None

class DeployRequest(BaseModel):
    version: str
    mode: str  # "queue" or "regular"
    isolated_db: bool = False
    name: Optional[str] = None
    snapshot: Optional[str] = None
    custom_values: Optional[CustomValues] = None
```

**Step 2: Add function to build Helm values from CustomValues**

Add helper function in `web-ui/api/versions.py`:

```python
def build_helm_values(custom: CustomValues) -> dict:
    """Convert CustomValues to Helm values dictionary."""
    values = {}

    # Environment variables
    if custom.envVars:
        values['extraEnv'] = {ev.key: ev.value for ev in custom.envVars}

    # Resource limits
    if custom.resources:
        resources = {}
        if custom.resources.cpu or custom.resources.memory:
            resources['main'] = {'limits': {}}
            if custom.resources.cpu:
                resources['main']['limits']['cpu'] = custom.resources.cpu
            if custom.resources.memory:
                resources['main']['limits']['memory'] = custom.resources.memory
        if resources:
            values['resources'] = resources

    # Worker replicas
    if custom.workerReplicas is not None:
        values['replicas'] = {'workers': custom.workerReplicas}

    # Raw YAML override (merge, raw takes precedence)
    if custom.rawYaml:
        try:
            raw_values = yaml.safe_load(custom.rawYaml)
            if isinstance(raw_values, dict):
                values = deep_merge(values, raw_values)
        except yaml.YAMLError:
            pass  # Invalid YAML, ignore

    return values

def deep_merge(base: dict, override: dict) -> dict:
    """Deep merge two dictionaries, override takes precedence."""
    result = base.copy()
    for key, value in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = value
    return result
```

**Step 3: Update deploy_version to use custom values**

Modify the `deploy_version` function to write custom values to a temp file:

```python
@router.post("")
async def deploy_version(request: DeployRequest):
    """Deploy a new n8n version."""
    try:
        mode_flag = "--queue" if request.mode == "queue" else "--regular"
        cmd = ["/workspace/scripts/deploy-version.sh", request.version, mode_flag]

        if request.isolated_db:
            cmd.append("--isolated-db")

        if request.name:
            cmd.extend(["--name", request.name])

        if request.snapshot:
            cmd.extend(["--snapshot", request.snapshot])

        # Handle custom values
        values_file = None
        if request.custom_values:
            helm_values = build_helm_values(request.custom_values)
            if helm_values:
                # Write to temp file
                fd, values_file = tempfile.mkstemp(suffix='.yaml', prefix='helm-values-')
                try:
                    with os.fdopen(fd, 'w') as f:
                        yaml.dump(helm_values, f)
                    cmd.extend(["--values-file", values_file])
                except:
                    if values_file and os.path.exists(values_file):
                        os.unlink(values_file)
                    raise

        result = subprocess.run(cmd, capture_output=True, text=True, cwd="/workspace")

        # Clean up temp file
        if values_file and os.path.exists(values_file):
            os.unlink(values_file)

        # ... rest of the function unchanged
```

**Step 4: Update deploy-version.sh to accept --values-file**

Add to the flag parsing section in `scripts/deploy-version.sh`:

```bash
VALUES_FILE=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --queue|--regular)
      MODE=$1
      shift
      ;;
    --isolated-db)
      ISOLATED_DB=$1
      shift
      ;;
    --name)
      CUSTOM_NAME="$2"
      shift 2
      ;;
    --snapshot)
      SNAPSHOT_NAME="$2"
      shift 2
      ;;
    --values-file)
      VALUES_FILE="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done
```

And update the Helm install command section:

```bash
# Build Helm command
HELM_CMD="helm install \"$RELEASE_NAME\" ./charts/n8n-instance \
  --set n8nVersion=\"$VERSION\" \
  --set queueMode=\"$QUEUE_MODE\" \
  --set isolatedDB=\"$ISOLATED\" \
  --namespace \"$NAMESPACE\" \
  --create-namespace"

# Add snapshot parameters if provided
if [ -n "$SNAPSHOT_NAME" ]; then
  HELM_CMD="$HELM_CMD \
    --set database.isolated.snapshot.enabled=true \
    --set database.isolated.snapshot.name=\"${SNAPSHOT_NAME}.sql\""
fi

# Add custom values file if provided
if [ -n "$VALUES_FILE" ]; then
  HELM_CMD="$HELM_CMD -f \"$VALUES_FILE\""
fi

# Execute Helm install
eval "$HELM_CMD"
```

**Step 5: Commit**

```bash
git add web-ui/api/versions.py scripts/deploy-version.sh
git commit -m "feat(api): handle custom values in deployment request"
```

---

## Task 4: Create Custom Values UI Component

**Files:**
- Create: `web-ui-next/components/custom-values-form.tsx`

**Step 1: Create the component**

Create `web-ui-next/components/custom-values-form.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { PlusIcon, XIcon, ChevronRightIcon, CodeIcon } from 'lucide-react'
import type { CustomValues, EnvVar } from '@/lib/types'

interface CustomValuesFormProps {
  value: CustomValues
  onChange: (value: CustomValues) => void
  isQueueMode: boolean
}

export function CustomValuesForm({ value, onChange, isQueueMode }: CustomValuesFormProps) {
  const [rawYamlOpen, setRawYamlOpen] = useState(false)

  const envVars = value.envVars || []

  const addEnvVar = () => {
    onChange({
      ...value,
      envVars: [...envVars, { key: '', value: '' }],
    })
  }

  const updateEnvVar = (index: number, field: 'key' | 'value', newValue: string) => {
    const updated = [...envVars]
    updated[index] = { ...updated[index], [field]: newValue }
    onChange({ ...value, envVars: updated })
  }

  const removeEnvVar = (index: number) => {
    onChange({
      ...value,
      envVars: envVars.filter((_, i) => i !== index),
    })
  }

  const updateResources = (field: 'cpu' | 'memory', newValue: string) => {
    onChange({
      ...value,
      resources: {
        ...value.resources,
        [field]: newValue || undefined,
      },
    })
  }

  const updateWorkerReplicas = (newValue: string) => {
    const num = parseInt(newValue, 10)
    onChange({
      ...value,
      workerReplicas: isNaN(num) ? undefined : num,
    })
  }

  const updateRawYaml = (newValue: string) => {
    onChange({
      ...value,
      rawYaml: newValue || undefined,
    })
  }

  return (
    <div className="space-y-4">
      {/* Environment Variables */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Environment Variables</Label>
        <div className="space-y-2">
          {envVars.map((env, index) => (
            <div key={index} className="flex gap-2">
              <Input
                placeholder="N8N_LOG_LEVEL"
                value={env.key}
                onChange={(e) => updateEnvVar(index, 'key', e.target.value)}
                className="flex-1 font-mono text-sm"
              />
              <Input
                placeholder="debug"
                value={env.value}
                onChange={(e) => updateEnvVar(index, 'value', e.target.value)}
                className="flex-1 font-mono text-sm"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeEnvVar(index)}
              >
                <XIcon className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addEnvVar}
            className="w-full"
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            Add Variable
          </Button>
        </div>
      </div>

      {/* Resources */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Resource Limits</Label>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">CPU Limit</Label>
            <Input
              placeholder="1000m"
              value={value.resources?.cpu || ''}
              onChange={(e) => updateResources('cpu', e.target.value)}
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Memory Limit</Label>
            <Input
              placeholder="2Gi"
              value={value.resources?.memory || ''}
              onChange={(e) => updateResources('memory', e.target.value)}
              className="font-mono text-sm"
            />
          </div>
        </div>
      </div>

      {/* Worker Replicas (queue mode only) */}
      {isQueueMode && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Worker Replicas</Label>
          <Input
            type="number"
            min="1"
            max="10"
            placeholder="2"
            value={value.workerReplicas ?? ''}
            onChange={(e) => updateWorkerReplicas(e.target.value)}
            className="w-24 font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Number of worker pods (default: 2)
          </p>
        </div>
      )}

      {/* Raw YAML Override */}
      <Collapsible open={rawYamlOpen} onOpenChange={setRawYamlOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 text-sm hover:underline">
          <ChevronRightIcon className="h-4 w-4 transition-transform data-[state=open]:rotate-90" />
          <CodeIcon className="h-4 w-4" />
          Raw YAML Override (Advanced)
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <Textarea
            placeholder={`# Override any Helm value\nn8nConfig:\n  timezone: "Europe/London"\ndatabase:\n  shared:\n    host: "custom-db.example.com"`}
            value={value.rawYaml || ''}
            onChange={(e) => updateRawYaml(e.target.value)}
            className="font-mono text-sm min-h-[120px]"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Raw YAML values merged with form settings (raw takes precedence)
          </p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add web-ui-next/components/custom-values-form.tsx
git commit -m "feat(ui): add CustomValuesForm component"
```

---

## Task 5: Integrate Custom Values into Deploy Drawer

**Files:**
- Modify: `web-ui-next/components/deploy-drawer.tsx`

**Step 1: Import the component and types**

Add imports at the top of `web-ui-next/components/deploy-drawer.tsx`:

```typescript
import { CustomValuesForm } from '@/components/custom-values-form'
import type { CustomValues } from '@/lib/types'
```

**Step 2: Add state for custom values**

Add state after existing state declarations:

```typescript
const [customValues, setCustomValues] = useState<CustomValues>({})
const [customValuesOpen, setCustomValuesOpen] = useState(false)
```

**Step 3: Add Custom Values section in the UI**

Add after the Isolated DB checkbox section (around line 371):

```typescript
{/* Custom Values Section */}
<Collapsible open={customValuesOpen} onOpenChange={setCustomValuesOpen}>
  <CollapsibleTrigger className="flex items-center gap-2 text-sm hover:underline">
    <ChevronRightIcon className="h-4 w-4 transition-transform data-[state=open]:rotate-90" />
    Custom Values
  </CollapsibleTrigger>
  <CollapsibleContent className="pt-4 border rounded-lg p-4 mt-2">
    <CustomValuesForm
      value={customValues}
      onChange={setCustomValues}
      isQueueMode={mode === 'queue'}
    />
  </CollapsibleContent>
</Collapsible>
```

**Step 4: Update the deploy mutation call**

Update `handleDeploy` to include custom values:

```typescript
const handleDeploy = () => {
  if (!version) {
    toast.error('Version required', {
      description: 'Please enter a version number',
    })
    return
  }

  if (customName && !validateName(customName)) {
    toast.error('Invalid name', {
      description: 'Please fix the custom name validation errors',
    })
    return
  }

  // Filter out empty env vars
  const filteredCustomValues: CustomValues = {
    ...customValues,
    envVars: customValues.envVars?.filter(e => e.key && e.value),
  }

  // Only include custom_values if there's something to send
  const hasCustomValues =
    (filteredCustomValues.envVars && filteredCustomValues.envVars.length > 0) ||
    filteredCustomValues.resources?.cpu ||
    filteredCustomValues.resources?.memory ||
    filteredCustomValues.workerReplicas !== undefined ||
    filteredCustomValues.rawYaml

  deployMutation.mutate({
    version,
    mode,
    isolated_db: isolatedDb,
    name: customName || undefined,
    snapshot: snapshot || undefined,
    custom_values: hasCustomValues ? filteredCustomValues : undefined,
  })
}
```

**Step 5: Reset custom values on close**

Update the success handler to reset custom values:

```typescript
onSuccess: (data) => {
  if (data.success) {
    toast.success('Deployment started', {
      description: `n8n ${version} is being deployed`,
    })
    onOpenChange(false)
    setVersion('')
    setCustomName('')
    setCustomValues({})  // Add this line
    queryClient.invalidateQueries({ queryKey: ['deployments'] })
  } else {
    // ...
  }
},
```

**Step 6: Commit**

```bash
git add web-ui-next/components/deploy-drawer.tsx
git commit -m "feat(ui): integrate custom values into deploy drawer"
```

---

## Task 6: Test End-to-End

**Step 1: Test Helm template with extraEnv**

Run:
```bash
cd /Users/slowik/Desktop/n8n/k8s
helm template test ./charts/n8n-instance \
  --set n8nVersion=1.70.0 \
  --set extraEnv.N8N_LOG_LEVEL=debug \
  --set extraEnv.N8N_RUNNERS_ENABLED=true
```

Expected: ConfigMap should include the extra environment variables.

**Step 2: Test API with custom values**

Start the API server and send a test request:
```bash
curl -X POST http://localhost:8000/api/versions \
  -H "Content-Type: application/json" \
  -d '{
    "version": "1.70.0",
    "mode": "regular",
    "isolated_db": false,
    "custom_values": {
      "envVars": [
        {"key": "N8N_LOG_LEVEL", "value": "debug"}
      ],
      "resources": {
        "cpu": "500m",
        "memory": "1Gi"
      }
    }
  }'
```

**Step 3: Test UI flow**

1. Open the web UI
2. Click "Deploy New Version"
3. Select a version
4. Expand "Custom Values"
5. Add an environment variable: `N8N_LOG_LEVEL` = `debug`
6. Set resource limits
7. Click Deploy
8. Verify deployment succeeds with custom values

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete custom values feature for deployments

- Added extraEnv support to Helm chart
- Created CustomValuesForm component with hybrid UI
- Updated API to handle custom values via temp YAML file
- Integrated into deploy drawer

Users can now set environment variables, resource limits,
worker replicas, and raw YAML overrides when deploying."
```

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Add extraEnv support to Helm chart |
| 2 | Update TypeScript types |
| 3 | Update backend API and shell script |
| 4 | Create CustomValuesForm component |
| 5 | Integrate into deploy drawer |
| 6 | End-to-end testing |
