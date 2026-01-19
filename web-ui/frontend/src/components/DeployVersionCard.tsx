import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card, CardHeader, CardTitle, CardContent } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Button } from './ui/button'
import { RadioGroup, RadioGroupItem } from './ui/radio-group'
import { Checkbox } from './ui/checkbox'
import { useToast } from '@/hooks/use-toast'

export function DeployVersionCard() {
  const [version, setVersion] = useState('')
  const [mode, setMode] = useState<'queue' | 'regular'>('queue')
  const [isolatedDb, setIsolatedDb] = useState(false)

  const { toast } = useToast()
  const queryClient = useQueryClient()

  const deployMutation = useMutation({
    mutationFn: () => api.deployVersion({ version, mode, isolated_db: isolatedDb }),
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
    deployMutation.mutate()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Deploy New Version</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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
