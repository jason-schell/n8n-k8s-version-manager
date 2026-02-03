'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  ExternalLinkIcon,
  MoreHorizontalIcon,
  TrashIcon,
  LoaderIcon,
  ClockIcon,
  InfoIcon,
  CameraIcon,
  ServerIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { addActivity } from '@/lib/activity'
import type { Deployment } from '@/lib/types'
import { getAgeSeconds, formatAgeFromDate } from '@/lib/format'
import { CreateSnapshotDialog } from './create-snapshot-dialog'
import { DeploymentDetailsDrawer } from './deployment-details-drawer'
import { QueryErrorState } from '@/components/error-boundary'

// Status indicator with animated dot
function StatusBadge({ status, isDeleting }: { status: string; isDeleting: boolean }) {
  if (isDeleting) {
    return (
      <Badge variant="secondary" className="gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
        </span>
        deleting
      </Badge>
    )
  }

  const config: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; dotClass: string; pulse?: boolean }> = {
    running: { variant: 'default', dotClass: 'bg-emerald-500' },
    starting: { variant: 'secondary', dotClass: 'bg-amber-500', pulse: true },
    pending: { variant: 'secondary', dotClass: 'bg-amber-500', pulse: true },
    failed: { variant: 'destructive', dotClass: 'bg-red-500' },
    unknown: { variant: 'outline', dotClass: 'bg-zinc-400' },
  }

  const { variant, dotClass, pulse } = config[status] || config.unknown

  return (
    <Badge variant={variant} className="gap-1.5">
      <span className={`relative flex h-2 w-2`}>
        {pulse && <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${dotClass} opacity-75`} />}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${dotClass}`} />
      </span>
      {status}
    </Badge>
  )
}

interface DeploymentsTableProps {
  deployments: Deployment[] | undefined
  isLoading: boolean
  isError?: boolean
  onRetry?: () => void
  onDeployClick?: () => void
}

export function DeploymentsTable({ deployments, isLoading, isError, onRetry, onDeployClick }: DeploymentsTableProps) {
  const [deploymentToDelete, setDeploymentToDelete] = useState<Deployment | null>(null)
  const [deletingNamespace, setDeletingNamespace] = useState<string | null>(null)
  const [deploymentToView, setDeploymentToView] = useState<Deployment | null>(null)
  const [deploymentToSnapshot, setDeploymentToSnapshot] = useState<Deployment | null>(null)
  const queryClient = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: (namespace: string) => api.deleteDeployment(namespace),
    onSuccess: (_data, namespace) => {
      toast.success('Deployment deleted', {
        description: `${namespace} has been removed`,
      })
      addActivity('deleted', namespace)
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
      setDeletingNamespace(null)
    },
    onError: (error: Error, namespace) => {
      toast.error('Failed to delete deployment', {
        description: error.message,
      })
      setDeletingNamespace(null)
    },
  })

  const handleDeleteConfirm = () => {
    if (deploymentToDelete) {
      const namespace = deploymentToDelete.namespace
      setDeletingNamespace(namespace)
      setDeploymentToDelete(null) // Close modal immediately
      toast.loading(`Deleting ${namespace}...`, { id: `delete-${namespace}` })
      deleteMutation.mutate(namespace, {
        onSettled: () => {
          toast.dismiss(`delete-${namespace}`)
        }
      })
    }
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Version</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Age</TableHead>
            <TableHead>Mode</TableHead>
            <TableHead>Database</TableHead>
            <TableHead>URL</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            // Skeleton rows
            Array(3)
              .fill(0)
              .map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-5 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-6 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-12" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-48" />
                  </TableCell>
                  <TableCell className="text-right">
                    <Skeleton className="h-8 w-10 ml-auto" />
                  </TableCell>
                </TableRow>
              ))
          ) : isError ? (
            // Error state
            <TableRow>
              <TableCell colSpan={8} className="h-64">
                <QueryErrorState message="Failed to load deployments" onRetry={onRetry} />
              </TableCell>
            </TableRow>
          ) : deployments?.length === 0 ? (
            // Empty state
            <TableRow>
              <TableCell colSpan={8} className="h-72">
                <div className="flex flex-col items-center justify-center text-center">
                  <div className="rounded-full bg-muted p-4 mb-4">
                    <ServerIcon className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold text-lg mb-1">No deployments yet</h3>
                  <p className="text-muted-foreground text-sm mb-4 max-w-sm">
                    Deploy your first n8n version to start automating workflows
                  </p>
                  <Button onClick={onDeployClick}>
                    Deploy First Version
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            // Real data
            deployments?.map((d) => (
              <TableRow
                key={d.namespace}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => setDeploymentToView(d)}
              >
                <TableCell className="font-mono font-medium">
                  {d.version}
                </TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium">{d.name || d.namespace}</p>
                    {d.name && (
                      <p className="text-xs text-muted-foreground">{d.namespace}</p>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {(() => {
                    const isDeleting = deletingNamespace === d.namespace
                    const ageSeconds = getAgeSeconds(d.created_at)
                    const isStarting = ageSeconds < 90
                    const displayStatus = isStarting ? 'starting' : (d.status || 'unknown')
                    return <StatusBadge status={displayStatus} isDeleting={isDeleting} />
                  })()}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 text-muted-foreground text-sm">
                    <ClockIcon className="h-3 w-3" />
                    {formatAgeFromDate(d.created_at)}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{d.mode}</Badge>
                </TableCell>
                <TableCell>
                  <div>
                    <Badge variant="secondary">Isolated</Badge>
                    {d.snapshot && (
                      <p className="text-xs text-muted-foreground mt-1">
                        from: {d.snapshot}
                      </p>
                    )}
                  </div>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {d.url ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <a
                            href={d.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-sm font-mono px-2 py-1 rounded-md bg-muted hover:bg-muted/80 transition-colors"
                          >
                            <span className="max-w-[200px] truncate">{d.url.replace('http://', '')}</span>
                            <ExternalLinkIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
                          </a>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Open {d.url}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="relative">
                        <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
                      </div>
                      <span>Provisioning...</span>
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontalIcon className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => setDeploymentToView(d)}
                      >
                        <InfoIcon className="h-4 w-4 mr-2" />
                        View Details
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setDeploymentToSnapshot(d)}
                      >
                        <CameraIcon className="h-4 w-4 mr-2" />
                        Create Snapshot
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => d.url && window.open(d.url)}
                        disabled={!d.url}
                      >
                        <ExternalLinkIcon className="h-4 w-4 mr-2" />
                        Open n8n
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setDeploymentToDelete(d)}
                        className="text-destructive focus:text-destructive"
                      >
                        <TrashIcon className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <AlertDialog open={!!deploymentToDelete} onOpenChange={(open) => !open && setDeploymentToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Deployment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <span className="font-mono font-semibold">{deploymentToDelete?.namespace}</span>?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              onClick={(e) => {
                e.preventDefault()
                handleDeleteConfirm()
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DeploymentDetailsDrawer
        deployment={deploymentToView}
        open={!!deploymentToView}
        onOpenChange={(open) => !open && setDeploymentToView(null)}
      />

      <CreateSnapshotDialog
        deployment={deploymentToSnapshot}
        open={!!deploymentToSnapshot}
        onOpenChange={(open) => !open && setDeploymentToSnapshot(null)}
      />
    </div>
  )
}
