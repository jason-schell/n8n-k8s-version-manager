'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PlusIcon, XIcon, ChevronRightIcon, CodeIcon, DatabaseIcon, ServerIcon, SettingsIcon, CpuIcon } from 'lucide-react'
import type { HelmValues, EnvVar } from '@/lib/types'

interface HelmValuesEditorProps {
  value: HelmValues
  onChange: (value: HelmValues) => void
  isQueueMode: boolean
  isIsolatedDb: boolean
}

// Chart defaults - shown as placeholders
const DEFAULTS = {
  database: {
    shared: {
      host: 'postgres.n8n-system.svc.cluster.local',
      port: 5432,
      database: 'n8n',
      username: 'admin',
    },
    isolated: {
      image: 'postgres:16',
      storage: '10Gi',
    },
  },
  redis: {
    host: 'redis.n8n-system.svc.cluster.local',
    port: 6379,
  },
  n8nConfig: {
    timezone: 'America/New_York',
  },
  resources: {
    main: { cpu: { req: '250m', limit: '1000m' }, memory: { req: '512Mi', limit: '2Gi' } },
    worker: { cpu: { req: '250m', limit: '1000m' }, memory: { req: '512Mi', limit: '2Gi' } },
    webhook: { cpu: { req: '100m', limit: '500m' }, memory: { req: '256Mi', limit: '1Gi' } },
  },
  replicas: {
    workers: 2,
  },
}

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Warsaw',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Australia/Sydney',
  'Pacific/Auckland',
  'UTC',
]

export function HelmValuesEditor({ value, onChange, isQueueMode, isIsolatedDb }: HelmValuesEditorProps) {
  const [rawYamlOpen, setRawYamlOpen] = useState(false)
  const [envVars, setEnvVars] = useState<EnvVar[]>(() => {
    // Convert extraEnv Record to EnvVar array for editing
    if (value.extraEnv) {
      return Object.entries(value.extraEnv).map(([key, val]) => ({ key, value: val }))
    }
    return []
  })

  // Helper to update nested values
  const updateValue = (path: string[], newVal: unknown) => {
    const updated = { ...value }
    let current: Record<string, unknown> = updated

    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i]
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {}
      }
      current = current[key] as Record<string, unknown>
    }

    const lastKey = path[path.length - 1]
    if (newVal === '' || newVal === undefined || newVal === null) {
      delete current[lastKey]
    } else {
      current[lastKey] = newVal
    }

    // Clean up empty objects
    onChange(cleanEmptyObjects(updated))
  }

  // Remove empty nested objects
  const cleanEmptyObjects = (obj: Record<string, unknown>): HelmValues => {
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(obj)) {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        const cleaned = cleanEmptyObjects(val as Record<string, unknown>)
        if (Object.keys(cleaned).length > 0) {
          result[key] = cleaned
        }
      } else if (val !== undefined && val !== null && val !== '') {
        result[key] = val
      }
    }
    return result as HelmValues
  }

  // Env vars management
  const addEnvVar = () => {
    const newEnvVars = [...envVars, { key: '', value: '' }]
    setEnvVars(newEnvVars)
    syncEnvVars(newEnvVars)
  }

  const updateEnvVar = (index: number, field: 'key' | 'value', newValue: string) => {
    const updated = [...envVars]
    updated[index] = { ...updated[index], [field]: newValue }
    setEnvVars(updated)
    syncEnvVars(updated)
  }

  const removeEnvVar = (index: number) => {
    const updated = envVars.filter((_, i) => i !== index)
    setEnvVars(updated)
    syncEnvVars(updated)
  }

  const syncEnvVars = (vars: EnvVar[]) => {
    const validVars = vars.filter(v => v.key.trim())
    if (validVars.length === 0) {
      const { extraEnv: _, ...rest } = value
      onChange(rest)
    } else {
      const extraEnv: Record<string, string> = {}
      validVars.forEach(v => { extraEnv[v.key] = v.value })
      onChange({ ...value, extraEnv })
    }
  }

  return (
    <Tabs defaultValue="database" className="w-full">
      <TabsList className="grid w-full grid-cols-5 h-auto">
        <TabsTrigger value="database" className="text-xs px-2 py-1.5">
          <DatabaseIcon className="h-3 w-3 mr-1" />
          Database
        </TabsTrigger>
        {isQueueMode && (
          <TabsTrigger value="redis" className="text-xs px-2 py-1.5">
            <ServerIcon className="h-3 w-3 mr-1" />
            Redis
          </TabsTrigger>
        )}
        <TabsTrigger value="n8n" className="text-xs px-2 py-1.5">
          <SettingsIcon className="h-3 w-3 mr-1" />
          n8n
        </TabsTrigger>
        <TabsTrigger value="resources" className="text-xs px-2 py-1.5">
          <CpuIcon className="h-3 w-3 mr-1" />
          Resources
        </TabsTrigger>
        <TabsTrigger value="advanced" className="text-xs px-2 py-1.5">
          <CodeIcon className="h-3 w-3 mr-1" />
          Advanced
        </TabsTrigger>
      </TabsList>

      {/* Database Tab */}
      <TabsContent value="database" className="space-y-4 mt-4">
        {isIsolatedDb ? (
          // Isolated DB settings
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Configure the isolated PostgreSQL instance for this deployment.
            </p>
            <div className="space-y-2">
              <Label className="text-sm">Storage Size</Label>
              <Input
                placeholder={DEFAULTS.database.isolated.storage}
                value={value.database?.isolated?.storage?.size || ''}
                onChange={(e) => updateValue(['database', 'isolated', 'storage', 'size'], e.target.value)}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Persistent volume size (e.g., 10Gi, 20Gi)
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Postgres Image</Label>
              <Input
                placeholder={DEFAULTS.database.isolated.image}
                value={value.database?.isolated?.image || ''}
                onChange={(e) => updateValue(['database', 'isolated', 'image'], e.target.value)}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                PostgreSQL Docker image (e.g., postgres:16, postgres:15)
              </p>
            </div>
          </div>
        ) : (
          // Shared DB settings
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Configure connection to the shared PostgreSQL instance.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm">Host</Label>
                <Input
                  placeholder={DEFAULTS.database.shared.host}
                  value={value.database?.shared?.host || ''}
                  onChange={(e) => updateValue(['database', 'shared', 'host'], e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Port</Label>
                <Input
                  type="number"
                  placeholder={String(DEFAULTS.database.shared.port)}
                  value={value.database?.shared?.port || ''}
                  onChange={(e) => updateValue(['database', 'shared', 'port'], e.target.value ? parseInt(e.target.value) : undefined)}
                  className="font-mono text-sm"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Database Name</Label>
              <Input
                placeholder={DEFAULTS.database.shared.database}
                value={value.database?.shared?.database || ''}
                onChange={(e) => updateValue(['database', 'shared', 'database'], e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm">Username</Label>
                <Input
                  placeholder={DEFAULTS.database.shared.username}
                  value={value.database?.shared?.username || ''}
                  onChange={(e) => updateValue(['database', 'shared', 'username'], e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Password</Label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={value.database?.shared?.password || ''}
                  onChange={(e) => updateValue(['database', 'shared', 'password'], e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
            </div>
          </div>
        )}
      </TabsContent>

      {/* Redis Tab (queue mode only) */}
      {isQueueMode && (
        <TabsContent value="redis" className="space-y-4 mt-4">
          <p className="text-sm text-muted-foreground">
            Configure Redis connection for queue mode.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm">Host</Label>
              <Input
                placeholder={DEFAULTS.redis.host}
                value={value.redis?.host || ''}
                onChange={(e) => updateValue(['redis', 'host'], e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Port</Label>
              <Input
                type="number"
                placeholder={String(DEFAULTS.redis.port)}
                value={value.redis?.port || ''}
                onChange={(e) => updateValue(['redis', 'port'], e.target.value ? parseInt(e.target.value) : undefined)}
                className="font-mono text-sm"
              />
            </div>
          </div>
        </TabsContent>
      )}

      {/* n8n Config Tab */}
      <TabsContent value="n8n" className="space-y-4 mt-4">
        <p className="text-sm text-muted-foreground">
          Configure n8n application settings.
        </p>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm">Timezone</Label>
            <Select
              value={value.n8nConfig?.timezone || ''}
              onValueChange={(val) => updateValue(['n8nConfig', 'timezone'], val || undefined)}
            >
              <SelectTrigger className="font-mono text-sm">
                <SelectValue placeholder={DEFAULTS.n8nConfig.timezone} />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz} className="font-mono text-sm">
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Encryption Key</Label>
            <Input
              type="password"
              placeholder="Auto-generated if not set"
              value={value.n8nConfig?.encryptionKey || ''}
              onChange={(e) => updateValue(['n8nConfig', 'encryptionKey'], e.target.value)}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Used to encrypt credentials. Leave empty for auto-generation.
            </p>
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Webhook URL (optional)</Label>
            <Input
              placeholder="https://n8n.example.com"
              value={value.n8nConfig?.webhookUrl || ''}
              onChange={(e) => updateValue(['n8nConfig', 'webhookUrl'], e.target.value)}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Public URL for webhooks (only needed for external access)
            </p>
          </div>
        </div>
      </TabsContent>

      {/* Resources Tab */}
      <TabsContent value="resources" className="space-y-4 mt-4">
        <p className="text-sm text-muted-foreground">
          Configure resource limits for containers.
        </p>

        {/* Main Container */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Main Container</Label>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">CPU Request</Label>
              <Input
                placeholder={DEFAULTS.resources.main.cpu.req}
                value={value.resources?.main?.requests?.cpu || ''}
                onChange={(e) => updateValue(['resources', 'main', 'requests', 'cpu'], e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">CPU Limit</Label>
              <Input
                placeholder={DEFAULTS.resources.main.cpu.limit}
                value={value.resources?.main?.limits?.cpu || ''}
                onChange={(e) => updateValue(['resources', 'main', 'limits', 'cpu'], e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Memory Request</Label>
              <Input
                placeholder={DEFAULTS.resources.main.memory.req}
                value={value.resources?.main?.requests?.memory || ''}
                onChange={(e) => updateValue(['resources', 'main', 'requests', 'memory'], e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Memory Limit</Label>
              <Input
                placeholder={DEFAULTS.resources.main.memory.limit}
                value={value.resources?.main?.limits?.memory || ''}
                onChange={(e) => updateValue(['resources', 'main', 'limits', 'memory'], e.target.value)}
                className="font-mono text-sm"
              />
            </div>
          </div>
        </div>

        {/* Worker Container (queue mode only) */}
        {isQueueMode && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Worker Container</Label>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">CPU Request</Label>
                <Input
                  placeholder={DEFAULTS.resources.worker.cpu.req}
                  value={value.resources?.worker?.requests?.cpu || ''}
                  onChange={(e) => updateValue(['resources', 'worker', 'requests', 'cpu'], e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">CPU Limit</Label>
                <Input
                  placeholder={DEFAULTS.resources.worker.cpu.limit}
                  value={value.resources?.worker?.limits?.cpu || ''}
                  onChange={(e) => updateValue(['resources', 'worker', 'limits', 'cpu'], e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Memory Request</Label>
                <Input
                  placeholder={DEFAULTS.resources.worker.memory.req}
                  value={value.resources?.worker?.requests?.memory || ''}
                  onChange={(e) => updateValue(['resources', 'worker', 'requests', 'memory'], e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Memory Limit</Label>
                <Input
                  placeholder={DEFAULTS.resources.worker.memory.limit}
                  value={value.resources?.worker?.limits?.memory || ''}
                  onChange={(e) => updateValue(['resources', 'worker', 'limits', 'memory'], e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
            </div>
          </div>
        )}

        {/* Webhook Container (queue mode only) */}
        {isQueueMode && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Webhook Container</Label>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">CPU Request</Label>
                <Input
                  placeholder={DEFAULTS.resources.webhook.cpu.req}
                  value={value.resources?.webhook?.requests?.cpu || ''}
                  onChange={(e) => updateValue(['resources', 'webhook', 'requests', 'cpu'], e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">CPU Limit</Label>
                <Input
                  placeholder={DEFAULTS.resources.webhook.cpu.limit}
                  value={value.resources?.webhook?.limits?.cpu || ''}
                  onChange={(e) => updateValue(['resources', 'webhook', 'limits', 'cpu'], e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Memory Request</Label>
                <Input
                  placeholder={DEFAULTS.resources.webhook.memory.req}
                  value={value.resources?.webhook?.requests?.memory || ''}
                  onChange={(e) => updateValue(['resources', 'webhook', 'requests', 'memory'], e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Memory Limit</Label>
                <Input
                  placeholder={DEFAULTS.resources.webhook.memory.limit}
                  value={value.resources?.webhook?.limits?.memory || ''}
                  onChange={(e) => updateValue(['resources', 'webhook', 'limits', 'memory'], e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
            </div>
          </div>
        )}
      </TabsContent>

      {/* Advanced Tab */}
      <TabsContent value="advanced" className="space-y-4 mt-4">
        {/* Worker Replicas (queue mode only) */}
        {isQueueMode && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Worker Replicas</Label>
            <Input
              type="number"
              min="1"
              max="10"
              placeholder={String(DEFAULTS.replicas.workers)}
              value={value.replicas?.workers ?? ''}
              onChange={(e) => updateValue(['replicas', 'workers'], e.target.value ? parseInt(e.target.value) : undefined)}
              className="w-24 font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Number of worker pods (default: {DEFAULTS.replicas.workers})
            </p>
          </div>
        )}

        {/* Service Type */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Service Type</Label>
          <Select
            value={value.service?.type || ''}
            onValueChange={(val) => updateValue(['service', 'type'], val || undefined)}
          >
            <SelectTrigger className="w-48 font-mono text-sm">
              <SelectValue placeholder="NodePort (default)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NodePort">NodePort</SelectItem>
              <SelectItem value="ClusterIP">ClusterIP</SelectItem>
              <SelectItem value="LoadBalancer">LoadBalancer</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Environment Variables */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Extra Environment Variables</Label>
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

        {/* Raw YAML Override */}
        <Collapsible open={rawYamlOpen} onOpenChange={setRawYamlOpen}>
          <CollapsibleTrigger className="flex items-center gap-2 text-sm hover:underline">
            <ChevronRightIcon className={`h-4 w-4 transition-transform ${rawYamlOpen ? 'rotate-90' : ''}`} />
            <CodeIcon className="h-4 w-4" />
            Raw YAML Override
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <Textarea
              placeholder={`# Override any Helm value\n# These values take precedence over form settings\nscaling:\n  enabled: true`}
              value={value.rawYaml || ''}
              onChange={(e) => updateValue(['rawYaml'], e.target.value)}
              className="font-mono text-sm min-h-[120px]"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Raw YAML values merged with other settings (takes precedence)
            </p>
          </CollapsibleContent>
        </Collapsible>
      </TabsContent>
    </Tabs>
  )
}
