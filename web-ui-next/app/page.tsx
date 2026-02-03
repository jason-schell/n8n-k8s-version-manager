'use client'

import { useState, useEffect } from 'react'
import { Sidebar } from '@/components/sidebar'
import { DeploymentsTable } from '@/components/deployments-table'
import { DeployDrawer } from '@/components/deploy-drawer'
import { SnapshotsPanel } from '@/components/snapshots-panel'
import { ErrorBoundary } from '@/components/error-boundary'
import { InfrastructureStatus } from '@/components/infrastructure-status'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { RefreshButton } from '@/components/refresh-button'
import { Badge } from '@/components/ui/badge'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { QUERY_CONFIG } from '@/lib/query-config'

function formatLastUpdated(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  return `${Math.floor(seconds / 60)}m ago`
}

function LiveIndicator({ isFetching }: { isFetching: boolean }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="relative flex h-2 w-2">
        {isFetching && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${isFetching ? 'bg-emerald-500' : 'bg-emerald-500/50'}`} />
      </span>
      <span>{isFetching ? 'Syncing...' : 'Live'}</span>
    </div>
  )
}

export default function Home() {
  const [deployDrawerOpen, setDeployDrawerOpen] = useState(false)

  // Keyboard shortcut: N to open deploy drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input/textarea or if modifier keys pressed
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key.toLowerCase() === 'n') {
        e.preventDefault()
        setDeployDrawerOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const { data: deployments, isLoading: isLoadingDeployments, isError: isErrorDeployments, isFetching, refetch: refetchDeployments, dataUpdatedAt } = useQuery({
    queryKey: ['deployments'],
    queryFn: api.getDeployments,
    staleTime: QUERY_CONFIG.deployments.staleTime,
    // Smart polling: faster when pending deployments exist, slower when all stable
    refetchInterval: (query) => {
      const data = query.state.data
      const hasPending = data?.some((d: { status: string }) => d.status === 'pending')
      return hasPending
        ? QUERY_CONFIG.deployments.refetchIntervalPending
        : QUERY_CONFIG.deployments.refetchInterval
    },
  })

  const { data: snapshots, isLoading: isLoadingSnapshots, isError: isErrorSnapshots, refetch: refetchSnapshots } = useQuery({
    queryKey: ['snapshots'],
    queryFn: api.getSnapshots,
    staleTime: QUERY_CONFIG.snapshots.staleTime,
    refetchInterval: QUERY_CONFIG.snapshots.refetchInterval,
  })

  // Prefetch data needed for deploy drawer - loads in background on page load
  useQuery({
    queryKey: ['available-versions'],
    queryFn: api.getAvailableVersions,
    staleTime: QUERY_CONFIG.availableVersions.staleTime,
  })

  useQuery({
    queryKey: ['named-snapshots'],
    queryFn: api.getNamedSnapshots,
    staleTime: QUERY_CONFIG.namedSnapshots.staleTime,
  })

  return (
    <div className="flex min-h-screen">
      <Sidebar onDeployClick={() => setDeployDrawerOpen(true)} />
      <div className="flex-1 flex flex-col">
        <InfrastructureStatus />
        <main className="flex-1 p-8 space-y-6 overflow-y-auto">
        {/* Hero Section */}
        <div>
          <h1 className="text-3xl font-bold">n8n Version Manager</h1>
          <p className="text-muted-foreground mt-1">
            {deployments?.length || 0} active deployments
          </p>
        </div>

        {/* Deployments Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <CardTitle>Deployments</CardTitle>
                {deployments && deployments.length > 0 && (
                  <Badge variant="secondary" className="font-normal">
                    {deployments.length}
                  </Badge>
                )}
              </div>
              <CardDescription className="flex items-center gap-3">
                {dataUpdatedAt > 0 && (
                  <span>Updated {formatLastUpdated(dataUpdatedAt)}</span>
                )}
                <LiveIndicator isFetching={isFetching} />
              </CardDescription>
            </div>
            <RefreshButton onClick={() => refetchDeployments()} isLoading={isFetching} variant="outline" />
          </CardHeader>
          <CardContent>
            <ErrorBoundary>
              <DeploymentsTable
                deployments={deployments}
                isLoading={isLoadingDeployments}
                isError={isErrorDeployments}
                onRetry={() => refetchDeployments()}
                onDeployClick={() => setDeployDrawerOpen(true)}
              />
            </ErrorBoundary>
          </CardContent>
        </Card>

        {/* Snapshots Panel */}
        <ErrorBoundary>
          <SnapshotsPanel
            snapshots={snapshots}
            isLoading={isLoadingSnapshots}
            isError={isErrorSnapshots}
            onRetry={() => refetchSnapshots()}
          />
        </ErrorBoundary>
        </main>
      </div>

      <DeployDrawer open={deployDrawerOpen} onOpenChange={setDeployDrawerOpen} />
    </div>
  )
}
