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
import { Checkbox } from '@/components/ui/checkbox'
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
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { CustomValuesForm } from '@/components/custom-values-form'
import type { CustomValues } from '@/lib/types'

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
  const [isolatedDb, setIsolatedDb] = useState(false)
  const [snapshot, setSnapshot] = useState('')
  const [versionPopoverOpen, setVersionPopoverOpen] = useState(false)
  const [snapshotPopoverOpen, setSnapshotPopoverOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [customValues, setCustomValues] = useState<CustomValues>({})
  const [customValuesOpen, setCustomValuesOpen] = useState(false)

  const debouncedSearch = useDebounce(searchQuery, 300)

  const queryClient = useQueryClient()

  const { data: availableVersions, isLoading: isLoadingVersions } = useQuery({
    queryKey: ['available-versions'],
    queryFn: api.getAvailableVersions,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  const { data: clusterResources } = useQuery({
    queryKey: ['cluster-resources'],
    queryFn: api.getClusterResources,
    refetchInterval: 5000, // Poll every 5s while drawer open
    enabled: open,
  })

  const { data: namedSnapshots, isLoading: isLoadingSnapshots } = useQuery({
    queryKey: ['named-snapshots'],
    queryFn: api.getNamedSnapshots,
    enabled: open && isolatedDb,
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

  const deployMutation = useMutation({
    mutationFn: api.deployVersion,
    onSuccess: (data) => {
      if (data.success) {
        toast.success('Deployment started', {
          description: `n8n ${version} is being deployed`,
        })
        onOpenChange(false)
        setVersion('')
        setCustomName('')
        setCustomValues({})
        queryClient.invalidateQueries({ queryKey: ['deployments'] })
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

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-w-2xl mx-auto">
        <DrawerHeader>
          <DrawerTitle>Deploy New Version</DrawerTitle>
          <DrawerDescription>
            Configure and deploy a new n8n instance
          </DrawerDescription>
        </DrawerHeader>

        <div className="p-6 space-y-6">
          {/* Version Selection */}
          <div className="space-y-2">
            <Label>Version</Label>
            <Popover open={versionPopoverOpen} onOpenChange={setVersionPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={versionPopoverOpen}
                  className="w-full justify-between"
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

          {/* Isolated DB Checkbox */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="isolatedDb"
              checked={isolatedDb}
              onCheckedChange={(checked) => setIsolatedDb(checked as boolean)}
            />
            <Label htmlFor="isolatedDb" className="cursor-pointer">
              Use isolated database (experimental)
            </Label>
          </div>

          {/* Snapshot Selection (only when isolated DB enabled) */}
          {isolatedDb && (
            <div className="space-y-2">
              <Label>Snapshot (optional)</Label>
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
                Restore from a named snapshot when creating the isolated database
              </p>
            </div>
          )}

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
