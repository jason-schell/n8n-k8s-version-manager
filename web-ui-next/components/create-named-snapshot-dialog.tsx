'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { LoaderIcon } from 'lucide-react'

interface CreateNamedSnapshotDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateNamedSnapshotDialog({
  open,
  onOpenChange,
}: CreateNamedSnapshotDialogProps) {
  const [name, setName] = useState('')
  const [source, setSource] = useState('shared')
  const queryClient = useQueryClient()

  const createMutation = useMutation({
    mutationFn: () => api.createNamedSnapshot({ name, source }),
    onSuccess: (data) => {
      if (data.success) {
        toast.success('Snapshot created', {
          description: `Named snapshot "${name}" has been created`,
        })
        queryClient.invalidateQueries({ queryKey: ['snapshots'] })
        onOpenChange(false)
        setName('')
        setSource('shared')
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

  const handleCreate = () => {
    // Validate name
    if (!name.trim()) {
      toast.error('Name required', {
        description: 'Please enter a snapshot name',
      })
      return
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      toast.error('Invalid name', {
        description: 'Use only letters, numbers, hyphens, and underscores',
      })
      return
    }

    createMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Named Snapshot</DialogTitle>
          <DialogDescription>
            Create a reusable snapshot with a custom name
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="snapshot-name">Snapshot Name</Label>
            <Input
              id="snapshot-name"
              placeholder="e.g., test-data-v1, prod-clone"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={createMutation.isPending}
            />
            <p className="text-xs text-muted-foreground">
              Use only letters, numbers, hyphens, and underscores
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="snapshot-source">Source Database</Label>
            <Select
              value={source}
              onValueChange={setSource}
              disabled={createMutation.isPending}
            >
              <SelectTrigger id="snapshot-source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="shared">Shared Database</SelectItem>
                {/* TODO: Add isolated instance namespaces from deployments API */}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? (
              <>
                <LoaderIcon className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Snapshot'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
