'use client'

import { useState } from 'react'
import { Sidebar } from '@/components/sidebar'
import { StatCard } from '@/components/stat-card'
import { MemoryStatCard } from '@/components/memory-stat-card'
import { DeploymentsTable } from '@/components/deployments-table'
import { DeployDrawer } from '@/components/deploy-drawer'
import { SnapshotsPanel } from '@/components/snapshots-panel'
import { ErrorBoundary } from '@/components/error-boundary'
import { InfrastructureStatus } from '@/components/infrastructure-status'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PlusIcon, PackageIcon, DatabaseIcon } from 'lucide-react'
import { RefreshButton } from '@/components/refresh-button'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { QUERY_CONFIG } from '@/lib/query-config'

export default function Home() {
  const [deployDrawerOpen, setDeployDrawerOpen] = useState(false)
  const { data: deployments, isLoading: isLoadingDeployments, isError: isErrorDeployments, isFetching, refetch: refetchDeployments } = useQuery({
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
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <InfrastructureStatus />
        <main className="flex-1 p-8 space-y-6 overflow-y-auto">
        {/* Hero Section */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">n8n Version Manager</h1>
            <p className="text-muted-foreground mt-1">
              {deployments?.length || 0} active deployments
            </p>
          </div>
          <Button size="lg" onClick={() => setDeployDrawerOpen(true)}>
            <PlusIcon className="h-4 w-4 mr-2" />
            Deploy New Version
          </Button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            label="Active Deployments"
            value={deployments?.length || 0}
            icon={<PackageIcon className="h-8 w-8" />}
            isLoading={isLoadingDeployments}
          />
          <StatCard
            label="Snapshots"
            value={snapshots?.length || 0}
            icon={<DatabaseIcon className="h-8 w-8" />}
            isLoading={isLoadingSnapshots}
          />
          <MemoryStatCard />
        </div>

        {/* Deployments Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Active Deployments</CardTitle>
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
