'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
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
import { CameraIcon, DatabaseIcon, RotateCcwIcon, LoaderIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useState } from 'react'
import { CreateNamedSnapshotDialog } from './create-named-snapshot-dialog'
import { Skeleton } from '@/components/ui/skeleton'

export function SnapshotsPanel() {
  const [restoreSnapshot, setRestoreSnapshot] = useState<string | null>(null)
  const [createNamedOpen, setCreateNamedOpen] = useState(false)
  const queryClient = useQueryClient()

  const { data: snapshots, isLoading } = useQuery({
    queryKey: ['snapshots'],
    queryFn: api.getSnapshots,
    refetchInterval: 10000, // Poll every 10s
  })

  const createMutation = useMutation({
    mutationFn: api.createSnapshot,
    onSuccess: (data) => {
      if (data.success) {
        toast.success('Snapshot creation started', {
          description: 'Snapshot will appear in list when complete',
        })
        queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      } else {
        toast.error('Failed to create snapshot', {
          description: data.error,
        })
      }
    },
    onError: (error: Error) => {
      toast.error('Failed to create snapshot', {
        description: error.message,
      })
    },
  })

  const restoreMutation = useMutation({
    mutationFn: (filename: string) => api.restoreSnapshot(filename),
    onSuccess: (data) => {
      if (data.success) {
        toast.success('Snapshot restored successfully', {
          description: 'Database has been restored from snapshot',
        })
      } else {
        toast.error('Failed to restore snapshot', {
          description: data.error,
        })
      }
      setRestoreSnapshot(null)
    },
    onError: (error: Error) => {
      toast.error('Failed to restore snapshot', {
        description: error.message,
      })
      setRestoreSnapshot(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (filename: string) => api.deleteSnapshot(filename),
    onSuccess: (data) => {
      if (data.success) {
        toast.success('Snapshot deleted')
        queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      } else {
        toast.error('Failed to delete snapshot', {
          description: data.error,
        })
      }
    },
    onError: (error: Error) => {
      toast.error('Failed to delete snapshot', {
        description: error.message,
      })
    },
  })

  const handleRestore = (filename: string) => {
    setRestoreSnapshot(filename)
  }

  const confirmRestore = () => {
    if (restoreSnapshot) {
      restoreMutation.mutate(restoreSnapshot)
    }
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
          <div className="flex gap-2">
            <Button
              onClick={() => setCreateNamedOpen(true)}
              variant="outline"
              size="sm"
            >
              <CameraIcon className="h-4 w-4 mr-2" />
              Create Named
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              size="sm"
            >
              {createMutation.isPending ? (
                <>
                  <LoaderIcon className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <CameraIcon className="h-4 w-4 mr-2" />
                  Quick Snapshot
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible>
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
                ) : snapshots?.length === 0 ? (
                  // Empty state
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <DatabaseIcon className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="font-semibold text-lg mb-2">No Snapshots</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Create your first database snapshot
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Named Snapshots Section */}
                    {namedSnapshots.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium mb-2 text-muted-foreground">
                          Named Snapshots ({namedSnapshots.length})
                        </h4>
                        <div className="space-y-2">
                          {namedSnapshots.map((snapshot) => (
                            <div
                              key={snapshot.filename}
                              className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <DatabaseIcon className="h-4 w-4 text-muted-foreground" />
                                <div>
                                  <p className="font-mono text-sm font-medium">
                                    {snapshot.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {snapshot.filename}
                                  </p>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleRestore(snapshot.filename)}
                                >
                                  <RotateCcwIcon className="h-3 w-3 mr-2" />
                                  Restore
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => deleteMutation.mutate(snapshot.filename)}
                                >
                                  Delete
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Timestamped Snapshots Section */}
                    {autoSnapshots.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium mb-2 text-muted-foreground">
                          Automatic Snapshots ({autoSnapshots.length})
                        </h4>
                        <div className="space-y-2">
                          {autoSnapshots.map((snapshot) => (
                            <div
                              key={snapshot.filename}
                              className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <DatabaseIcon className="h-4 w-4 text-muted-foreground" />
                                <div>
                                  <p className="font-mono text-sm font-medium">
                                    {snapshot.filename}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {snapshot.timestamp}
                                  </p>
                                </div>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleRestore(snapshot.filename)}
                              >
                                <RotateCcwIcon className="h-3 w-3 mr-2" />
                                Restore
                              </Button>
                            </div>
                          ))}
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

      {/* Restore Confirmation Dialog */}
      <AlertDialog open={!!restoreSnapshot} onOpenChange={() => setRestoreSnapshot(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore snapshot?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>This will OVERWRITE the current database with:</p>
              <p className="font-mono text-sm bg-muted p-2 rounded">
                {restoreSnapshot}
              </p>
              <p className="text-destructive font-medium">
                This action cannot be undone!
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRestore}
              className="bg-destructive hover:bg-destructive/90"
            >
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Named Snapshot Dialog */}
      <CreateNamedSnapshotDialog
        open={createNamedOpen}
        onOpenChange={setCreateNamedOpen}
      />
    </>
  )
}
