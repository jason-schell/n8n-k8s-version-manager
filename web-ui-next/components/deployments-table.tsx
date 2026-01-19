'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
  AlertDialogAction,
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
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { Deployment } from '@/lib/types'

function getAgeSeconds(isoDate: string | undefined): number {
  if (!isoDate) return Infinity
  const created = new Date(isoDate)
  const now = new Date()
  return Math.floor((now.getTime() - created.getTime()) / 1000)
}

function formatAge(isoDate: string | undefined): string {
  if (!isoDate) return '-'
  const diffSecs = getAgeSeconds(isoDate)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffDays > 0) return `${diffDays}d ${diffHours % 24}h`
  if (diffHours > 0) return `${diffHours}h ${diffMins % 60}m`
  if (diffMins > 0) return `${diffMins}m`
  return `${diffSecs}s`
}

export function DeploymentsTable() {
  const [deploymentToDelete, setDeploymentToDelete] = useState<Deployment | null>(null)
  const queryClient = useQueryClient()

  const { data: deployments, isLoading } = useQuery({
    queryKey: ['deployments'],
    queryFn: api.getDeployments,
    refetchInterval: 5000, // Poll every 5s
  })

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
              <TableCell colSpan={7} className="h-64 text-center">
                <p className="text-muted-foreground">No deployments found</p>
                <Button className="mt-4">Deploy First Version</Button>
              </TableCell>
            </TableRow>
          ) : (
            // Real data with stagger animation
            deployments?.map((d, i) => (
              <TableRow
                key={d.namespace}
                className="animate-in fade-in slide-in-from-bottom-2"
                style={{ animationDelay: `${i * 50}ms` }}
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
                        className={cn((displayStatus === 'pending' || displayStatus === 'starting') && 'animate-pulse')}
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
                    {formatAge(d.created_at)}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{d.mode}</Badge>
                </TableCell>
                <TableCell>
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
                    <Badge variant="secondary" className="animate-pulse">
                      <LoaderIcon className="h-3 w-3 mr-1 animate-spin" />
                      Pending...
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontalIcon className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
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
            <AlertDialogAction
              onClick={handleDeleteConfirm}
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
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
