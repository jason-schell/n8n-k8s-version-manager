import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card, CardHeader, CardTitle, CardContent } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { RadioGroup, RadioGroupItem } from './ui/radio-group'
import { Checkbox } from './ui/checkbox'
import { useToast } from '@/hooks/use-toast'

export function DeployVersionCard() {
  const [version, setVersion] = useState('')
  const [mode, setMode] = useState<'queue' | 'regular'>('queue')
  const [isolatedDb, setIsolatedDb] = useState(false)
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState('')

  const { toast } = useToast()
  const queryClient = useQueryClient()

  const { data: availableVersions } = useQuery({
    queryKey: ['available-versions'],
    queryFn: () => api.getAvailableVersions(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnMount: false,
  })

  const validateName = (value: string) => {
    if (!value) {
      setNameError('')
      return true
    }

    // Kubernetes namespace validation
    const valid = /^[a-z0-9-]+$/.test(value) &&
                  value.length <= 63 &&
                  /^[a-z0-9]/.test(value) &&
                  /[a-z0-9]$/.test(value)

    if (!valid) {
      setNameError('Must be lowercase alphanumeric + hyphens, max 63 chars, start/end with alphanumeric')
      return false
    }

    setNameError('')
    return true
  }

  const deployMutation = useMutation({
    mutationFn: () => api.deployVersion({
      version,
      mode,
      isolated_db: isolatedDb,
      name: name || undefined, // Only send if provided
    }),
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: 'Deployment initiated',
          description: `n8n ${version} is being deployed`,
        })
        setVersion('')
        queryClient.invalidateQueries({ queryKey: ['versions'] })
      } else {
        toast({
          variant: 'destructive',
          title: 'Deployment failed',
          description: data.error || 'Unknown error',
        })
      }
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Deployment failed',
        description: error.message,
      })
    },
  })

  const handleDeploy = () => {
    if (!version) {
      toast({
        variant: 'destructive',
        title: 'Version required',
        description: 'Please enter a version number',
      })
      return
    }
    if (name && !validateName(name)) {
      toast({
        variant: 'destructive',
        title: 'Invalid name',
        description: 'Please fix the custom name validation errors',
      })
      return
    }
    deployMutation.mutate()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Deploy New Version</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {availableVersions?.versions && availableVersions.versions.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Quick select version:</Label>
            <div className="flex gap-2 flex-wrap">
              {availableVersions.versions.slice(0, 8).map((v: string) => (
                <Badge
                  key={v}
                  variant="outline"
                  className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                  onClick={() => setVersion(v)}
                >
                  {v}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div>
          <Label htmlFor="version">Version</Label>
          <Input
            id="version"
            placeholder="1.90.0"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            disabled={deployMutation.isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="name">Custom Name (optional)</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              validateName(e.target.value)
            }}
            placeholder="Leave blank for auto-generated name"
            className={nameError ? 'border-red-500' : ''}
            disabled={deployMutation.isPending}
          />
          {nameError && (
            <p className="text-sm text-red-500">{nameError}</p>
          )}
          <p className="text-xs text-muted-foreground">
            If blank: auto-generates n8n-v{version ? version.replace(/\./g, '-') : '{version}'}. Custom names enable multiple deployments of same version.
          </p>
        </div>

        <div>
          <Label>Mode</Label>
          <RadioGroup value={mode} onValueChange={(v) => setMode(v as 'queue' | 'regular')}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="queue" id="queue" />
              <Label htmlFor="queue" className="font-normal">Queue (with workers)</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="regular" id="regular" />
              <Label htmlFor="regular" className="font-normal">Regular (single process)</Label>
            </div>
          </RadioGroup>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="isolated-db"
            checked={isolatedDb}
            onCheckedChange={(checked) => setIsolatedDb(checked as boolean)}
          />
          <Label htmlFor="isolated-db" className="font-normal">
            Isolated Database
          </Label>
        </div>

        <Button
          onClick={handleDeploy}
          disabled={deployMutation.isPending}
          className="w-full"
        >
          {deployMutation.isPending ? 'Deploying...' : 'Deploy'}
        </Button>
      </CardContent>
    </Card>
  )
}
