'use client'

import { useState } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { LoaderIcon, AlertTriangleIcon } from 'lucide-react'
import { toast } from 'sonner'

interface RestoreSnapshotDialogProps {
  snapshot: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RestoreSnapshotDialog({
  snapshot,
  open,
  onOpenChange,
}: RestoreSnapshotDialogProps) {
  const [selectedNamespace, setSelectedNamespace] = useState<string>('')
  const queryClient = useQueryClient()

  const { data: deployments, isLoading: deploymentsLoading } = useQuery({
    queryKey: ['deployments'],
    queryFn: api.getDeployments,
    enabled: open,
  })

  const restoreMutation = useMutation({
    mutationFn: (params: { snapshot: string; namespace: string }) =>
      api.restoreToDeployment(params),
    onSuccess: (data) => {
      if (data.success) {
        toast.success('Snapshot restored', {
          description: `Database restored to ${selectedNamespace}`,
        })
        queryClient.invalidateQueries({ queryKey: ['deployments'] })
        onOpenChange(false)
        setSelectedNamespace('')
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
    if (snapshot && selectedNamespace) {
      restoreMutation.mutate({ snapshot, namespace: selectedNamespace })
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setSelectedNamespace('')
    }
    onOpenChange(newOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Restore Snapshot</DialogTitle>
          <DialogDescription>
            Choose a deployment to restore this snapshot into.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Snapshot</label>
            <div className="font-mono text-sm bg-muted p-2 rounded">
              {snapshot}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Target Deployment</label>
            {deploymentsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <LoaderIcon className="h-4 w-4 animate-spin" />
                Loading deployments...
              </div>
            ) : deployments?.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No deployments available. Deploy a version first.
              </div>
            ) : (
              <Select value={selectedNamespace} onValueChange={setSelectedNamespace}>
                <SelectTrigger>
                  <SelectValue placeholder="Select deployment..." />
                </SelectTrigger>
                <SelectContent>
                  {deployments?.map((d) => (
                    <SelectItem key={d.namespace} value={d.namespace}>
                      <div className="flex items-center gap-2">
                        <span className="font-mono">v{d.version}</span>
                        <span className="text-muted-foreground">
                          {d.name || d.namespace}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {selectedNamespace && (
            <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <AlertTriangleIcon className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-destructive">Warning</p>
                <p className="text-muted-foreground">
                  This will <strong>overwrite</strong> the database in{' '}
                  <span className="font-mono">{selectedNamespace}</span>. This action
                  cannot be undone.
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={restoreMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleRestore}
            disabled={!selectedNamespace || restoreMutation.isPending}
            className="bg-destructive hover:bg-destructive/90"
          >
            {restoreMutation.isPending ? (
              <>
                <LoaderIcon className="h-4 w-4 mr-2 animate-spin" />
                Restoring...
              </>
            ) : (
              'Restore'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
