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
} from 'lucide-react'
import { toast } from 'sonner'
import type { Deployment } from '@/lib/types'
import { getAgeSeconds, formatAgeFromDate } from '@/lib/format'
import { CreateSnapshotDialog } from './create-snapshot-dialog'
import { DeploymentDetailsDrawer } from './deployment-details-drawer'

interface DeploymentsTableProps {
  deployments: Deployment[] | undefined
  isLoading: boolean
}

export function DeploymentsTable({ deployments, isLoading }: DeploymentsTableProps) {
  const [deploymentToDelete, setDeploymentToDelete] = useState<Deployment | null>(null)
  const [deploymentToView, setDeploymentToView] = useState<Deployment | null>(null)
  const [deploymentToSnapshot, setDeploymentToSnapshot] = useState<Deployment | null>(null)
  const queryClient = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: (namespace: string) => api.deleteDeployment(namespace),
    onSuccess: (_data, namespace) => {
      toast.success('Deployment deleted', {
        description: `${namespace} has been removed`,
      })
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
      setDeploymentToDelete(null)
    },
    onError: (error: Error) => {
      toast.error('Failed to delete deployment', {
        description: error.message,
      })
    },
  })

  const handleDeleteConfirm = () => {
    if (deploymentToDelete) {
      deleteMutation.mutate(deploymentToDelete.namespace)
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
          ) : deployments?.length === 0 ? (
            // Empty state - will enhance in next task
            <TableRow>
              <TableCell colSpan={8} className="h-64 text-center">
                <p className="text-muted-foreground">No deployments found</p>
                <Button className="mt-4">Deploy First Version</Button>
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
                    const ageSeconds = getAgeSeconds(d.created_at)
                    const isStarting = ageSeconds < 90
                    const displayStatus = isStarting ? 'starting' : (d.status || 'unknown')
                    return (
                      <Badge
                        variant={
                          displayStatus === 'running'
                            ? 'default'
                            : displayStatus === 'failed'
                            ? 'destructive'
                            : 'secondary'
                        }
                      >
                        <span className="inline-block h-2 w-2 rounded-full bg-current mr-2" />
                        {displayStatus}
                      </Badge>
                    )
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
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline flex items-center gap-1"
                    >
                      {d.url}
                      <ExternalLinkIcon className="h-3 w-3" />
                    </a>
                  ) : (
                    <Badge variant="secondary">
                      <LoaderIcon className="h-3 w-3 mr-1 animate-spin" />
                      Pending...
                    </Badge>
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
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <Button
              onClick={(e) => {
                e.preventDefault()
                handleDeleteConfirm()
              }}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <>
                  <LoaderIcon className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
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
