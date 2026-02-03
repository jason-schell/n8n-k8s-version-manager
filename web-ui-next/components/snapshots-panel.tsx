'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { DatabaseIcon, RotateCcwIcon, UploadIcon, TagIcon, ClockIcon, TrashIcon, LoaderIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useState, useMemo } from 'react'
import { RestoreSnapshotDialog } from './restore-snapshot-dialog'
import { UploadSnapshotDialog } from './upload-snapshot-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { QueryErrorState } from '@/components/error-boundary'
import { addActivity } from '@/lib/activity'
import type { Snapshot } from '@/lib/types'

interface SnapshotsPanelProps {
  snapshots: Snapshot[] | undefined
  isLoading: boolean
  isError?: boolean
  onRetry?: () => void
}

export function SnapshotsPanel({ snapshots, isLoading, isError, onRetry }: SnapshotsPanelProps) {
  const [restoreSnapshot, setRestoreSnapshot] = useState<string | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [userToggledAccordion, setUserToggledAccordion] = useState(false)
  const queryClient = useQueryClient()

  // Auto-expand accordion when few snapshots exist (unless user has manually toggled)
  const accordionValue = useMemo(() => {
    if (userToggledAccordion) return undefined // Let user's choice persist
    if (snapshots && snapshots.length > 0 && snapshots.length <= 5) {
      return 'snapshots'
    }
    return undefined
  }, [snapshots, userToggledAccordion])

  const handleAccordionChange = () => {
    setUserToggledAccordion(true)
  }

  const [deletingSnapshot, setDeletingSnapshot] = useState<string | null>(null)

  const deleteMutation = useMutation({
    mutationFn: (filename: string) => api.deleteSnapshot(filename),
    onSuccess: (data, filename) => {
      if (data.success) {
        toast.success('Snapshot deleted')
        queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      } else {
        toast.error('Failed to delete snapshot', {
          description: data.error,
        })
      }
      setDeletingSnapshot(null)
    },
    onError: (error: Error) => {
      toast.error('Failed to delete snapshot', {
        description: error.message,
      })
      setDeletingSnapshot(null)
    },
  })

  const handleDelete = (filename: string) => {
    setDeletingSnapshot(filename)
    deleteMutation.mutate(filename)
  }

  const handleRestore = (filename: string) => {
    setRestoreSnapshot(filename)
  }

  const namedSnapshots = snapshots?.filter((s) => s.type === 'named') || []
  const autoSnapshots = snapshots?.filter((s) => s.type === 'auto') || []

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle>Database Snapshots</CardTitle>
            <CardDescription>
              {snapshots?.length || 0} snapshots available
            </CardDescription>
          </div>
          <Button
            onClick={() => setUploadOpen(true)}
            variant="outline"
            size="sm"
          >
            <UploadIcon className="h-4 w-4 mr-2" />
            Upload
          </Button>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible value={accordionValue} onValueChange={handleAccordionChange}>
            <AccordionItem value="snapshots" className="border-none">
              <AccordionTrigger className="hover:no-underline">
                <span className="text-sm">
                  View Snapshots ({snapshots?.length || 0})
                </span>
              </AccordionTrigger>
              <AccordionContent>
                {isLoading ? (
                  // Loading skeleton
                  <div className="space-y-2 py-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <Skeleton className="h-4 w-4" />
                          <div className="space-y-1">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-24" />
                          </div>
                        </div>
                        <Skeleton className="h-8 w-20" />
                      </div>
                    ))}
                  </div>
                ) : isError ? (
                  // Error state
                  <QueryErrorState message="Failed to load snapshots" onRetry={onRetry} />
                ) : snapshots?.length === 0 ? (
                  // Empty state
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <div className="rounded-full bg-muted p-4 mb-4">
                      <DatabaseIcon className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="font-semibold text-lg mb-1">No snapshots yet</h3>
                    <p className="text-sm text-muted-foreground max-w-xs">
                      Snapshots let you backup and restore database states across deployments
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Named Snapshots Section */}
                    {namedSnapshots.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <TagIcon className="h-4 w-4 text-muted-foreground" />
                          <h4 className="text-sm font-medium text-muted-foreground">
                            Named Snapshots
                          </h4>
                          <Badge variant="secondary" className="text-xs">{namedSnapshots.length}</Badge>
                        </div>
                        <div className="space-y-2">
                          {namedSnapshots.map((snapshot) => {
                            const isDeleting = deletingSnapshot === snapshot.filename
                            return (
                              <div
                                key={snapshot.filename}
                                className={`group flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-all ${isDeleting ? 'opacity-50' : ''}`}
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="shrink-0 h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center">
                                    <DatabaseIcon className="h-4 w-4 text-primary" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-medium text-sm truncate">
                                      {snapshot.name}
                                    </p>
                                    <p className="text-xs text-muted-foreground font-mono truncate">
                                      {snapshot.filename}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => handleRestore(snapshot.filename)}
                                          disabled={isDeleting}
                                        >
                                          <RotateCcwIcon className="h-3.5 w-3.5" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Restore to deployment</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleDelete(snapshot.filename)}
                                          disabled={isDeleting}
                                          className="text-muted-foreground hover:text-destructive"
                                        >
                                          {isDeleting ? (
                                            <LoaderIcon className="h-3.5 w-3.5 animate-spin" />
                                          ) : (
                                            <TrashIcon className="h-3.5 w-3.5" />
                                          )}
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Delete snapshot</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Timestamped Snapshots Section */}
                    {autoSnapshots.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <ClockIcon className="h-4 w-4 text-muted-foreground" />
                          <h4 className="text-sm font-medium text-muted-foreground">
                            Automatic Snapshots
                          </h4>
                          <Badge variant="outline" className="text-xs">{autoSnapshots.length}</Badge>
                        </div>
                        <div className="space-y-2">
                          {autoSnapshots.map((snapshot) => {
                            const isDeleting = deletingSnapshot === snapshot.filename
                            return (
                              <div
                                key={snapshot.filename}
                                className={`group flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-all ${isDeleting ? 'opacity-50' : ''}`}
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="shrink-0 h-9 w-9 rounded-md bg-muted flex items-center justify-center">
                                    <DatabaseIcon className="h-4 w-4 text-muted-foreground" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-mono text-sm truncate">
                                      {snapshot.filename}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {snapshot.timestamp}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => handleRestore(snapshot.filename)}
                                          disabled={isDeleting}
                                        >
                                          <RotateCcwIcon className="h-3.5 w-3.5" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Restore to deployment</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* Restore to Deployment Dialog */}
      <RestoreSnapshotDialog
        snapshot={restoreSnapshot}
        open={!!restoreSnapshot}
        onOpenChange={(open) => !open && setRestoreSnapshot(null)}
      />

      {/* Upload Snapshot Dialog */}
      <UploadSnapshotDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
      />
    </>
  )
}
