'use client'

import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  DatabaseIcon,
  LoaderIcon,
  RefreshCwIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { Deployment } from '@/lib/types'

interface ChangeDatabaseDialogProps {
  deployment: Deployment | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ChangeDatabaseDialog({
  deployment,
  open,
  onOpenChange,
}: ChangeDatabaseDialogProps) {
  const [isolatedDb, setIsolatedDb] = useState(deployment?.isolated_db ?? false)
  const [snapshot, setSnapshot] = useState(deployment?.snapshot ?? '')
  const [snapshotPopoverOpen, setSnapshotPopoverOpen] = useState(false)
  const queryClient = useQueryClient()

  // Sync state when deployment changes
  React.useEffect(() => {
    if (deployment) {
      setIsolatedDb(deployment.isolated_db)
      setSnapshot(deployment.snapshot ?? '')
    }
  }, [deployment])

  const { data: namedSnapshots, isLoading: isLoadingSnapshots } = useQuery({
    queryKey: ['named-snapshots'],
    queryFn: api.getNamedSnapshots,
    enabled: open && isolatedDb,
  })

  const redeployMutation = useMutation({
    mutationFn: async () => {
      if (!deployment) return

      // First delete the existing deployment
      await api.deleteDeployment(deployment.namespace)

      // Wait a bit for cleanup
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Redeploy with new config
      return api.deployVersion({
        version: deployment.version,
        mode: deployment.mode === 'queue' ? 'queue' : 'regular',
        isolated_db: isolatedDb,
        name: deployment.name,
        snapshot: isolatedDb && snapshot ? snapshot : undefined,
      })
    },
    onSuccess: (data) => {
      if (data?.success) {
        toast.success('Redeployment started', {
          description: `${deployment?.name || deployment?.namespace} is being redeployed with new database configuration`,
        })
        onOpenChange(false)
        queryClient.invalidateQueries({ queryKey: ['deployments'] })
      } else {
        toast.error('Redeployment failed', {
          description: data?.error || 'Unknown error',
        })
      }
    },
    onError: (error: Error) => {
      toast.error('Redeployment failed', {
        description: error.message,
      })
    },
  })

  const hasChanges =
    isolatedDb !== deployment?.isolated_db ||
    snapshot !== (deployment?.snapshot ?? '')

  const handleRedeploy = () => {
    if (!hasChanges) {
      toast.info('No changes detected', {
        description: 'Database configuration is unchanged',
      })
      return
    }

    redeployMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DatabaseIcon className="h-5 w-5" />
            Change Database Configuration
          </DialogTitle>
          <DialogDescription>
            Update database settings for{' '}
            <span className="font-mono font-semibold">
              {deployment?.name || deployment?.namespace}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Current Config */}
          <div className="rounded-lg border p-4 bg-muted/50">
            <p className="text-sm font-medium mb-2">Current Configuration</p>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {deployment?.isolated_db ? 'Isolated' : 'Shared'}
              </Badge>
              {deployment?.snapshot && (
                <span className="text-sm text-muted-foreground">
                  ({deployment.snapshot})
                </span>
              )}
            </div>
          </div>

          {/* Isolated DB Toggle */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="isolatedDb"
              checked={isolatedDb}
              onCheckedChange={(checked) => {
                setIsolatedDb(checked as boolean)
                if (!checked) {
                  setSnapshot('') // Clear snapshot when switching to shared
                }
              }}
            />
            <Label htmlFor="isolatedDb" className="cursor-pointer">
              Use isolated database
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
                Restore from a named snapshot when redeploying
              </p>
            </div>
          )}

          {/* Warning when changes detected */}
          {hasChanges && (
            <div className="rounded-lg border-2 border-orange-200 bg-orange-50 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangleIcon className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-semibold text-orange-900 mb-1">
                    Redeployment Required
                  </p>
                  <p className="text-orange-700">
                    Changing the database configuration requires redeploying the instance.
                    This will cause brief downtime.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={redeployMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleRedeploy}
            disabled={redeployMutation.isPending || !hasChanges}
          >
            {redeployMutation.isPending ? (
              <>
                <LoaderIcon className="h-4 w-4 mr-2 animate-spin" />
                Redeploying...
              </>
            ) : (
              <>
                <RefreshCwIcon className="h-4 w-4 mr-2" />
                Redeploy
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
