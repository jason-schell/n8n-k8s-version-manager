'use client'

import { useState, useRef } from 'react'
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
import { LoaderIcon, UploadIcon, FileIcon, XIcon } from 'lucide-react'
import { toast } from 'sonner'

interface UploadSnapshotDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UploadSnapshotDialog({
  open,
  onOpenChange,
}: UploadSnapshotDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  const uploadMutation = useMutation({
    mutationFn: ({ file, name }: { file: File; name: string }) =>
      api.uploadSnapshot(file, name),
    onSuccess: (data) => {
      if (data.success) {
        toast.success('Snapshot uploaded', {
          description: data.message,
        })
        queryClient.invalidateQueries({ queryKey: ['snapshots'] })
        handleClose()
      } else {
        toast.error('Upload failed', {
          description: data.error || 'Unknown error',
        })
      }
    },
    onError: (error: Error) => {
      toast.error('Upload failed', {
        description: error.message,
      })
    },
  })

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      // Auto-fill name from filename (without extension)
      if (!name) {
        const baseName = selectedFile.name.replace(/\.sql$/i, '')
        // Clean the name to only allow valid characters
        const cleanName = baseName.replace(/[^a-zA-Z0-9_-]/g, '-')
        setName(cleanName)
      }
    }
  }

  const handleUpload = () => {
    if (file && name) {
      uploadMutation.mutate({ file, name })
    }
  }

  const handleClose = () => {
    setFile(null)
    setName('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    onOpenChange(false)
  }

  const clearFile = () => {
    setFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const isValidName = /^[a-zA-Z0-9_-]+$/.test(name)

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload Snapshot</DialogTitle>
          <DialogDescription>
            Upload a PostgreSQL dump file (.sql) to use as a snapshot.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="file">SQL File</Label>
            {file ? (
              <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/50">
                <FileIcon className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={clearFile}
                >
                  <XIcon className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadIcon className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Click to select a .sql file
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Maximum size: 500MB
                </p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".sql"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Snapshot Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-snapshot"
            />
            {name && !isValidName && (
              <p className="text-xs text-destructive">
                Use only letters, numbers, hyphens, and underscores
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={uploadMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={!file || !name || !isValidName || uploadMutation.isPending}
          >
            {uploadMutation.isPending ? (
              <>
                <LoaderIcon className="h-4 w-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <UploadIcon className="h-4 w-4 mr-2" />
                Upload
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
