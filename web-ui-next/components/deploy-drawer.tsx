'use client'

import { useState, useMemo, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { formatMemory, formatAge } from '@/lib/format'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  RocketIcon,
  ChevronRightIcon,
  LayersIcon,
  ZapIcon,
  LoaderIcon,
  ChevronsUpDownIcon,
  CheckIcon,
  ExternalLinkIcon,
  AlertTriangleIcon,
  RefreshCwIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { HelmValuesEditor } from '@/components/helm-values-editor'
import type { HelmValues, K8sEvent, PodStatus } from '@/lib/types'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

interface DeployDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => clearTimeout(handler)
  }, [value, delay])

  return debouncedValue
}

export function DeployDrawer({ open, onOpenChange }: DeployDrawerProps) {
  const [version, setVersion] = useState('')
  const [customName, setCustomName] = useState('')
  const [nameError, setNameError] = useState('')
  const [mode, setMode] = useState<'queue' | 'regular'>('queue')
  const [snapshot, setSnapshot] = useState('')
  const [versionPopoverOpen, setVersionPopoverOpen] = useState(false)
  const [snapshotPopoverOpen, setSnapshotPopoverOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [helmValues, setHelmValues] = useState<HelmValues>({})
  const [configOpen, setConfigOpen] = useState(false)

  const debouncedSearch = useDebounce(searchQuery, 300)

  const queryClient = useQueryClient()

  // Data is prefetched on page load, so it should be immediately available
  const { data: availableVersions, isLoading: isLoadingVersions, isFetching: isFetchingVersions, refetch: refetchVersions } = useQuery({
    queryKey: ['available-versions'],
    queryFn: api.getAvailableVersions,
    staleTime: 5 * 60 * 1000, // 5 minutes - versions rarely change
  })

  const { data: clusterResources } = useQuery({
    queryKey: ['cluster-resources'],
    queryFn: api.getClusterResources,
    staleTime: 5000,
    refetchInterval: open ? 5000 : false, // Only poll while drawer is open
  })

  // Data is prefetched on page load
  const { data: namedSnapshots, isLoading: isLoadingSnapshots } = useQuery({
    queryKey: ['named-snapshots'],
    queryFn: api.getNamedSnapshots,
    staleTime: 60000, // 1 minute
  })

  const QUEUE_MODE_MEMORY = 1792
  const REGULAR_MODE_MEMORY = 512

  const requiredMemory = mode === 'queue' ? QUEUE_MODE_MEMORY : REGULAR_MODE_MEMORY
  const hasCapacity = mode === 'queue'
    ? clusterResources?.can_deploy.queue_mode
    : clusterResources?.can_deploy.regular_mode
  const availableMemory = clusterResources?.memory?.available_mi || 0

  const filteredVersions = useMemo(() => {
    if (!availableVersions) return []
    if (!debouncedSearch) return availableVersions
    return availableVersions.filter((v) =>
      v.toLowerCase().includes(debouncedSearch.toLowerCase())
    )
  }, [availableVersions, debouncedSearch])

  const isSearching = searchQuery !== debouncedSearch

  const trackDeploymentProgress = async (namespace: string, versionStr: string) => {
    const toastId = toast.loading('Deploying...', {
      description: 'Creating namespace and resources...',
    })

    // Poll for up to 3 minutes (90 iterations * 2s)
    for (let i = 0; i < 90; i++) {
      await sleep(2000)

      try {
        const [eventsRes, podsRes] = await Promise.all([
          api.getNamespaceEvents(namespace, 10),
          api.getNamespacePods(namespace),
        ])

        const events = eventsRes.events || []
        const pods = podsRes.pods || []

        // Find latest significant event
        const latestEvent = events[0]
        if (latestEvent) {
          const msg = latestEvent.message.length > 60
            ? latestEvent.message.slice(0, 57) + '...'
            : latestEvent.message
          toast.loading('Deploying...', {
            id: toastId,
            description: msg,
          })
        }

        // Check if all pods are running
        const allRunning = pods.length > 0 && pods.every((p: PodStatus) => p.phase === 'Running')
        if (allRunning) {
          toast.success('Deployment complete', {
            id: toastId,
            description: `n8n ${versionStr} is now running (${pods.length} pod${pods.length !== 1 ? 's' : ''})`,
          })
          queryClient.invalidateQueries({ queryKey: ['deployments'] })
          return
        }

        // Check for failures
        const failed = events.find((e: K8sEvent) =>
          e.type === 'Warning' &&
          ['Failed', 'BackOff', 'ErrImagePull', 'ImagePullBackOff'].includes(e.reason)
        )
        if (failed) {
          toast.warning('Deployment issue', {
            id: toastId,
            description: failed.message.slice(0, 80),
          })
          // Don't return - keep tracking, it might recover
        }
      } catch {
        // Namespace might not exist yet, continue polling
      }
    }

    // Timeout
    toast.warning('Deployment taking longer than expected', {
      id: toastId,
      description: 'Check the deployment details for more info',
    })
  }

  const deployMutation = useMutation({
    mutationFn: api.deployVersion,
    onSuccess: (data) => {
      if (data.success) {
        // Calculate namespace
        const namespace = customName || `n8n-v${version.replace(/\./g, '-')}`

        onOpenChange(false)
        setVersion('')
        setCustomName('')
        setHelmValues({})
        queryClient.invalidateQueries({ queryKey: ['deployments'] })

        // Start tracking progress in background
        trackDeploymentProgress(namespace, version)
      } else {
        toast.error('Deployment failed', {
          description: data.error || 'Unknown error',
        })
      }
    },
    onError: (error: Error) => {
      toast.error('Deployment failed', {
        description: error.message,
      })
    },
  })

  const validateName = (value: string) => {
    if (!value) {
      setNameError('')
      return true
    }

    const valid =
      /^[a-z0-9-]+$/.test(value) &&
      value.length <= 63 &&
      /^[a-z0-9]/.test(value) &&
      /[a-z0-9]$/.test(value)

    if (!valid) {
      setNameError(
        'Must be lowercase alphanumeric + hyphens, max 63 chars, start/end with alphanumeric'
      )
      return false
    }

    setNameError('')
    return true
  }

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

    // Only include helm_values if there's something to send
    const hasHelmValues = Object.keys(helmValues).length > 0

    deployMutation.mutate({
      version,
      mode,
      name: customName || undefined,
      snapshot: snapshot || undefined,
      helm_values: hasHelmValues ? helmValues : undefined,
    })
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-w-2xl mx-auto">
        <DrawerHeader>
          <DrawerTitle>Deploy New Version</DrawerTitle>
          <DrawerDescription>
            Configure and deploy a new n8n instance
          </DrawerDescription>
        </DrawerHeader>

        <div className="p-6 space-y-6 overflow-y-auto max-h-[60vh]">
          {/* Version Selection */}
          <div className="space-y-2">
            <Label>Version</Label>
            <div className="flex gap-2">
              <Popover open={versionPopoverOpen} onOpenChange={setVersionPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={versionPopoverOpen}
                    className="flex-1 justify-between"
                  >
                    {version || 'Select version...'}
                    <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Search versions..."
                      value={searchQuery}
                      onValueChange={setSearchQuery}
                    />
                    <CommandList>
                      {isLoadingVersions || isSearching ? (
                        <div className="p-4 space-y-2">
                          {Array(4)
                            .fill(0)
                            .map((_, i) => (
                              <Skeleton key={i} className="h-8 w-full" />
                            ))}
                        </div>
                      ) : filteredVersions.length === 0 ? (
                        <CommandEmpty>No version found.</CommandEmpty>
                      ) : (
                        <CommandGroup>
                          {filteredVersions.map((v) => (
                            <CommandItem
                              key={v}
                              value={v}
                              onSelect={(currentValue) => {
                                setVersion(currentValue)
                                setVersionPopoverOpen(false)
                                setSearchQuery('')
                              }}
                            >
                              <CheckIcon
                                className={cn(
                                  'mr-2 h-4 w-4',
                                  version === v ? 'opacity-100' : 'opacity-0'
                                )}
                              />
                              <span className="flex-1">{v}</span>
                              <a
                                href={`https://github.com/n8n-io/n8n/releases/tag/n8n@${v}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-muted-foreground hover:text-foreground"
                              >
                                <ExternalLinkIcon className="h-3 w-3" />
                              </a>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <Button
                variant="outline"
                size="icon"
                onClick={() => refetchVersions()}
                disabled={isFetchingVersions}
                title="Refresh versions from GitHub"
              >
                <RefreshCwIcon className={cn("h-4 w-4", isFetchingVersions && "animate-spin")} />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Search or select from all available releases
            </p>
          </div>

          {/* Quick Select Badges */}
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">
              Quick Select
            </Label>
            <div className="flex gap-2 flex-wrap">
              {isLoadingVersions ? (
                Array(5)
                  .fill(0)
                  .map((_, i) => <Skeleton key={i} className="h-6 w-16" />)
              ) : (
                availableVersions?.slice(0, 5).map((v) => (
                  <Badge
                    key={v}
                    variant={version === v ? 'default' : 'outline'}
                    className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-all"
                    onClick={() => setVersion(v)}
                  >
                    {v}
                  </Badge>
                ))
              )}
            </div>
          </div>

          {/* Advanced Options (Collapsible) */}
          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-2 text-sm hover:underline">
              <ChevronRightIcon className="h-4 w-4 transition-transform data-[state=open]:rotate-90" />
              Advanced Options
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="customName">Custom Name (optional)</Label>
                <Input
                  id="customName"
                  placeholder="my-custom-deployment"
                  value={customName}
                  onChange={(e) => {
                    setCustomName(e.target.value)
                    validateName(e.target.value)
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank for auto-generated name (n8n-v
                  {version.replace(/\./g, '-') || '{version}'})
                </p>
                {nameError && (
                  <p className="text-xs text-destructive">{nameError}</p>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Mode Selection */}
          <div className="space-y-2">
            <Label>Mode</Label>
            <div className="flex gap-2">
              <Button
                variant={mode === 'queue' ? 'default' : 'outline'}
                onClick={() => setMode('queue')}
                className="flex-1"
              >
                <LayersIcon className="h-4 w-4 mr-2" />
                Queue
              </Button>
              <Button
                variant={mode === 'regular' ? 'default' : 'outline'}
                onClick={() => setMode('regular')}
                className="flex-1"
              >
                <ZapIcon className="h-4 w-4 mr-2" />
                Regular
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Queue mode runs separate worker processes
            </p>
          </div>

          {/* Initial Data Selection */}
          <div className="space-y-2">
            <Label>Initial Data</Label>
              <Popover open={snapshotPopoverOpen} onOpenChange={setSnapshotPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={snapshotPopoverOpen}
                    className="w-full justify-between"
                  >
                    {snapshot || 'Select snapshot...'}
                    <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search snapshots..." />
                    <CommandList>
                      {isLoadingSnapshots ? (
                        <div className="p-4 space-y-2">
                          {Array(3)
                            .fill(0)
                            .map((_, i) => (
                              <Skeleton key={i} className="h-8 w-full" />
                            ))}
                        </div>
                      ) : !namedSnapshots || namedSnapshots.length === 0 ? (
                        <CommandEmpty>No snapshots available.</CommandEmpty>
                      ) : (
                        <CommandGroup>
                          <CommandItem
                            value=""
                            onSelect={() => {
                              setSnapshot('')
                              setSnapshotPopoverOpen(false)
                            }}
                          >
                            <CheckIcon
                              className={cn(
                                'mr-2 h-4 w-4',
                                !snapshot ? 'opacity-100' : 'opacity-0'
                              )}
                            />
                            None (fresh database)
                          </CommandItem>
                          {namedSnapshots.map((s) => (
                            <CommandItem
                              key={s.filename}
                              value={s.name || s.filename}
                              onSelect={() => {
                                setSnapshot(s.name || s.filename)
                                setSnapshotPopoverOpen(false)
                              }}
                            >
                              <CheckIcon
                                className={cn(
                                  'mr-2 h-4 w-4',
                                  snapshot === (s.name || s.filename) ? 'opacity-100' : 'opacity-0'
                                )}
                              />
                              {s.name || s.filename}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            <p className="text-xs text-muted-foreground">
              Select a snapshot to initialize the database with existing data
            </p>
          </div>

          {/* Configuration Section */}
          <Collapsible open={configOpen} onOpenChange={setConfigOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 text-sm hover:underline">
              <ChevronRightIcon className={`h-4 w-4 transition-transform ${configOpen ? 'rotate-90' : ''}`} />
              Configuration
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4 border rounded-lg p-4 mt-2">
              <HelmValuesEditor
                value={helmValues}
                onChange={setHelmValues}
                isQueueMode={mode === 'queue'}
              />
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Capacity Warning */}
        {clusterResources && !hasCapacity && (
          <div className="px-6 pb-4">
            <div className="border-2 border-red-200 rounded-lg p-4 bg-red-50 max-h-96 overflow-y-auto">
              <div className="flex items-start gap-3">
                <AlertTriangleIcon className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1 space-y-2 min-w-0">
                  <div>
                    <p className="font-semibold text-red-900">
                      Insufficient Memory
                    </p>
                    <p className="text-sm text-red-700 mt-1">
                      This {mode} mode deployment needs {formatMemory(requiredMemory)}, but only {formatMemory(availableMemory)} is available.
                    </p>
                  </div>

                  {clusterResources.deployments.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-red-900">
                        Active deployments using memory:
                      </p>
                      <div className="space-y-1 max-h-48 overflow-y-auto pr-2">
                        {clusterResources.deployments.slice(0, 5).map((deployment) => (
                          <div
                            key={deployment.namespace}
                            className="flex items-center gap-2 text-sm bg-white rounded p-2 border border-red-100"
                          >
                            <span className="font-mono text-xs text-gray-700">
                              {deployment.namespace}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {formatMemory(deployment.memory_mi)}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatAge(deployment.age_seconds)} old
                            </span>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-red-700 mt-2">
                        Go to the dashboard to delete deployments and free up memory.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <DrawerFooter>
          <Button
            onClick={handleDeploy}
            disabled={deployMutation.isPending || !version || !hasCapacity}
            className="w-full"
          >
            {deployMutation.isPending ? (
              <>
                <LoaderIcon className="h-4 w-4 mr-2 animate-spin" />
                Deploying...
              </>
            ) : (
              <>
                <RocketIcon className="h-4 w-4 mr-2" />
                Deploy
              </>
            )}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
