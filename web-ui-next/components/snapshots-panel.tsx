'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { DatabaseIcon, RotateCcwIcon, UploadIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useState } from 'react'
import { RestoreSnapshotDialog } from './restore-snapshot-dialog'
import { UploadSnapshotDialog } from './upload-snapshot-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import type { Snapshot } from '@/lib/types'

interface SnapshotsPanelProps {
  snapshots: Snapshot[] | undefined
  isLoading: boolean
}

export function SnapshotsPanel({ snapshots, isLoading }: SnapshotsPanelProps) {
  const [restoreSnapshot, setRestoreSnapshot] = useState<string | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const queryClient = useQueryClient()

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
