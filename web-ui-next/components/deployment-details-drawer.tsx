'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Deployment, K8sEvent, PodStatus, PodLogs, Snapshot } from '@/lib/types'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  RefreshCwIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ClockIcon,
  BoxIcon,
  ScrollTextIcon,
  ActivityIcon,
  SettingsIcon,
  CopyIcon,
  DatabaseIcon,
  LoaderIcon,
  AlertTriangleIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface DeploymentDetailsDrawerProps {
  deployment: Deployment | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatRelativeTime(timestamp: string | undefined): string {
  if (!timestamp) return '-'
  const date = new Date(timestamp)
  const now = new Date()
  const diffSecs = Math.floor((now.getTime() - date.getTime()) / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)

  if (diffHours > 0) return `${diffHours}h ago`
  if (diffMins > 0) return `${diffMins}m ago`
  return `${diffSecs}s ago`
}

function StatusTab({ namespace, enabled }: { namespace: string; enabled: boolean }) {
  const [selectedSnapshot, setSelectedSnapshot] = useState<string>('')
  const [showRestoreWarning, setShowRestoreWarning] = useState(false)
  const queryClient = useQueryClient()

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['pods', namespace],
    queryFn: () => api.getNamespacePods(namespace),
    refetchInterval: enabled ? 5000 : false, // Only poll when tab is active
    enabled,
  })

  // Snapshots are prefetched on page load, so no enabled check needed
  const { data: snapshotsData, isLoading: snapshotsLoading } = useQuery({
    queryKey: ['snapshots'],
    queryFn: api.getSnapshots,
    staleTime: 30000,
  })

  const restoreMutation = useMutation({
    mutationFn: (params: { snapshot: string; namespace: string }) =>
      api.restoreToDeployment(params),
    onSuccess: (data) => {
      if (data.success) {
        toast.success('Snapshot restored', {
          description: `Database restored to ${namespace}`,
        })
        queryClient.invalidateQueries({ queryKey: ['deployments'] })
        setSelectedSnapshot('')
        setShowRestoreWarning(false)
      } else {
        toast.error('Restore failed', {
          description: data.error || 'Unknown error',
        })
      }
    },
    onError: (error: Error) => {
      toast.error('Restore failed', {
        description: error.message,
      })
    },
  })

  const handleRestore = () => {
    if (selectedSnapshot) {
      restoreMutation.mutate({ snapshot: selectedSnapshot, namespace })
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="border rounded-lg p-3">
            <Skeleton className="h-5 w-32 mb-2" />
            <Skeleton className="h-4 w-48" />
          </div>
        ))}
      </div>
    )
  }

  const pods = data?.pods || []
  const snapshots = snapshotsData || []

  return (
    <div className="space-y-6">
      {/* Pods Section */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">
            {pods.length} pod{pods.length !== 1 ? 's' : ''}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCwIcon className={cn("h-4 w-4 mr-1", isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {pods.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No pods found
          </div>
        ) : (
          <div className="space-y-3">
            {pods.map((pod: PodStatus) => (
              <div key={pod.name} className="border rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <BoxIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono text-sm font-medium">{pod.name}</span>
                </div>
                <Badge
                  variant={
                    pod.phase === 'Running'
                      ? 'default'
                      : pod.phase === 'Failed'
                      ? 'destructive'
                      : 'secondary'
                  }
                >
                  {pod.phase}
                </Badge>
              </div>
              {pod.containers.map((container) => (
                <div
                  key={container.name}
                  className="ml-6 flex items-center gap-2 text-sm text-muted-foreground"
                >
                  {container.ready ? (
                    <CheckCircleIcon className="h-3 w-3 text-green-500" />
                  ) : (
                    <AlertCircleIcon className="h-3 w-3 text-yellow-500" />
                  )}
                  <span>{container.name}</span>
                  <span className="text-xs">
                    ({container.state}
                    {container.state_detail && `: ${container.state_detail}`})
                  </span>
                  {container.restart_count > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {container.restart_count} restart{container.restart_count !== 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>
              ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Database Section */}
      <div className="border-t pt-4">
        <div className="flex items-center gap-2 mb-3">
          <DatabaseIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Database</span>
        </div>

        <div className="space-y-3">
          <div className="flex gap-2">
            {snapshotsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <LoaderIcon className="h-4 w-4 animate-spin" />
                Loading snapshots...
              </div>
            ) : snapshots.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No snapshots available
              </div>
            ) : (
              <>
                <Select value={selectedSnapshot} onValueChange={(v) => {
                  setSelectedSnapshot(v)
                  setShowRestoreWarning(!!v)
                }}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select snapshot to restore..." />
                  </SelectTrigger>
                  <SelectContent>
                    {snapshots.map((snapshot: Snapshot) => (
                      <SelectItem key={snapshot.filename} value={snapshot.filename}>
                        {snapshot.name || snapshot.filename}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleRestore}
                  disabled={!selectedSnapshot || restoreMutation.isPending}
                  variant="destructive"
                  size="sm"
                >
                  {restoreMutation.isPending ? (
                    <>
                      <LoaderIcon className="h-4 w-4 mr-1 animate-spin" />
                      Restoring...
                    </>
                  ) : (
                    'Restore'
                  )}
                </Button>
              </>
            )}
          </div>

          {showRestoreWarning && selectedSnapshot && (
            <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <AlertTriangleIcon className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                This will <strong>overwrite</strong> the current database. This action cannot be undone.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function EventsTab({ namespace, enabled }: { namespace: string; enabled: boolean }) {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['events', namespace],
    queryFn: () => api.getNamespaceEvents(namespace),
    refetchInterval: enabled ? 5000 : false, // Only poll when tab is active
    enabled,
  })

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex gap-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 flex-1" />
          </div>
        ))}
      </div>
    )
  }

  const events = data?.events || []

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-sm text-muted-foreground">
          {events.length} event{events.length !== 1 ? 's' : ''}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCwIcon className={cn("h-4 w-4 mr-1", isFetching && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {events.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No events found
        </div>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
          {events.map((event: K8sEvent, i: number) => (
            <div
              key={`${event.timestamp}-${i}`}
              className="flex items-start gap-2 text-sm border-l-2 pl-2 py-1"
              style={{
                borderColor: event.type === 'Warning' ? 'rgb(234, 179, 8)' : 'rgb(34, 197, 94)',
              }}
            >
              <div className="flex items-center gap-1 text-muted-foreground min-w-[60px]">
                <ClockIcon className="h-3 w-3" />
                <span className="text-xs">{formatRelativeTime(event.timestamp)}</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={event.type === 'Warning' ? 'destructive' : 'secondary'}
                    className="text-xs"
                  >
                    {event.reason}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {event.object.kind}/{event.object.name}
                  </span>
                  {event.count > 1 && (
                    <span className="text-xs text-muted-foreground">
                      (x{event.count})
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 break-words">
                  {event.message}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const ALL_PODS = '__all_pods__'
const ALL_CONTAINERS = '__all_containers__'

function LogsTab({ namespace, enabled }: { namespace: string; enabled: boolean }) {
  const [selectedPod, setSelectedPod] = useState<string>(ALL_PODS)
  const [selectedContainer, setSelectedContainer] = useState<string>(ALL_CONTAINERS)

  const { data: podsData } = useQuery({
    queryKey: ['pods', namespace],
    queryFn: () => api.getNamespacePods(namespace),
    enabled, // Reuse pods data from StatusTab if already fetched
  })

  const actualPod = selectedPod === ALL_PODS ? undefined : selectedPod
  const actualContainer = selectedContainer === ALL_CONTAINERS ? undefined : selectedContainer

  const { data: logsData, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['logs', namespace, actualPod, actualContainer],
    queryFn: () =>
      api.getNamespaceLogs(
        namespace,
        actualPod,
        actualContainer
      ),
    refetchInterval: enabled ? 10000 : false, // Only poll when tab is active
    enabled,
  })

  const pods = podsData?.pods || []
  const logs = logsData?.logs || []

  const selectedPodData = pods.find((p) => p.name === selectedPod)
  const containers = selectedPodData?.containers || []

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <Select value={selectedPod} onValueChange={(v) => {
          setSelectedPod(v)
          setSelectedContainer(ALL_CONTAINERS)
        }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All pods" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_PODS}>All pods</SelectItem>
            {pods.map((pod) => (
              <SelectItem key={pod.name} value={pod.name}>
                {pod.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedPod !== ALL_PODS && containers.length > 1 && (
          <Select value={selectedContainer} onValueChange={setSelectedContainer}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All containers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CONTAINERS}>All containers</SelectItem>
              {containers.map((c) => (
                <SelectItem key={c.name} value={c.name}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="ml-auto"
        >
          <RefreshCwIcon className={cn("h-4 w-4 mr-1", isFetching && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No logs available
        </div>
      ) : (
        <div className="space-y-4">
          {logs.map((log: PodLogs) => (
            <div key={log.pod} className="space-y-1">
              {logs.length > 1 && (
                <div className="text-xs font-medium text-muted-foreground">
                  {log.pod}
                  {log.container && ` / ${log.container}`}
                </div>
              )}
              {log.error ? (
                <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
                  {log.error}
                </div>
              ) : (
                <pre className="text-xs bg-muted p-4 rounded-lg overflow-x-auto max-h-[300px] overflow-y-auto font-mono whitespace-pre-wrap break-words">
                  {log.logs || 'No logs'}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ConfigTab({ namespace, enabled }: { namespace: string; enabled: boolean }) {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['config', namespace],
    queryFn: () => api.getNamespaceConfig(namespace),
    refetchInterval: false, // Config doesn't change often
    staleTime: 5 * 60 * 1000, // 5 minutes - config is static
    enabled,
  })

  const copyToClipboard = async (value: string) => {
    await navigator.clipboard.writeText(value)
    toast.success('Copied to clipboard')
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 flex-1" />
          </div>
        ))}
      </div>
    )
  }

  const config = data?.config || {}
  const entries = Object.entries(config).sort(([a], [b]) => a.localeCompare(b))

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-sm text-muted-foreground">
          {entries.length} variable{entries.length !== 1 ? 's' : ''}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCwIcon className={cn("h-4 w-4 mr-1", isFetching && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No configuration found
        </div>
      ) : (
        <div className="space-y-1 max-h-[400px] overflow-y-auto pr-1">
          {entries.map(([key, value]) => (
            <div
              key={key}
              className="flex items-start gap-2 py-2 border-b last:border-b-0"
            >
              <div className="min-w-[180px] text-sm font-medium text-muted-foreground truncate">
                {key}
              </div>
              <div className="flex-1 flex items-center gap-2">
                <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded break-all flex-1">
                  {value}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => copyToClipboard(value)}
                >
                  <CopyIcon className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function DeploymentDetailsDrawer({
  deployment,
  open,
  onOpenChange,
}: DeploymentDetailsDrawerProps) {
  const [activeTab, setActiveTab] = useState('status')

  // Reset to status tab when drawer closes or deployment changes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setActiveTab('status')
    }
    onOpenChange(newOpen)
  }

  if (!deployment) return null

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            n8n v{deployment.version}
            {deployment.name && (
              <span className="text-muted-foreground font-normal">
                - {deployment.name}
              </span>
            )}
          </SheetTitle>
          <SheetDescription>
            {deployment.namespace} • {deployment.mode} mode
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
            <TabsList className="w-full">
              <TabsTrigger value="status" className="flex-1">
                <BoxIcon className="h-4 w-4 mr-1" />
                Status
              </TabsTrigger>
              <TabsTrigger value="events" className="flex-1">
                <ActivityIcon className="h-4 w-4 mr-1" />
                Events
              </TabsTrigger>
              <TabsTrigger value="logs" className="flex-1">
                <ScrollTextIcon className="h-4 w-4 mr-1" />
                Logs
              </TabsTrigger>
              <TabsTrigger value="config" className="flex-1">
                <SettingsIcon className="h-4 w-4 mr-1" />
                Config
              </TabsTrigger>
            </TabsList>

            <TabsContent value="status" className="mt-4">
              <StatusTab namespace={deployment.namespace} enabled={activeTab === 'status'} />
            </TabsContent>

            <TabsContent value="events" className="mt-4">
              <EventsTab namespace={deployment.namespace} enabled={activeTab === 'events'} />
            </TabsContent>

            <TabsContent value="logs" className="mt-4">
              <LogsTab namespace={deployment.namespace} enabled={activeTab === 'logs'} />
            </TabsContent>

            <TabsContent value="config" className="mt-4">
              <ConfigTab namespace={deployment.namespace} enabled={activeTab === 'config'} />
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  )
}
