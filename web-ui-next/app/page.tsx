'use client'

import { useState } from 'react'
import { Sidebar } from '@/components/sidebar'
import { StatCard } from '@/components/stat-card'
import { MemoryStatCard } from '@/components/memory-stat-card'
import { DeploymentsTable } from '@/components/deployments-table'
import { DeployDrawer } from '@/components/deploy-drawer'
import { SnapshotsPanel } from '@/components/snapshots-panel'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PlusIcon, PackageIcon, DatabaseIcon, RefreshCwIcon } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export default function Home() {
  const [deployDrawerOpen, setDeployDrawerOpen] = useState(false)
  const { data: deployments, isLoading: isLoadingDeployments, isFetching, refetch } = useQuery({
    queryKey: ['deployments'],
    queryFn: api.getDeployments,
  })

  const { data: snapshots, isLoading: isLoadingSnapshots } = useQuery({
    queryKey: ['snapshots'],
    queryFn: api.getSnapshots,
  })

  return (
    <div className="flex min-h-screen">
      <Sidebar />
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCwIcon className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </CardHeader>
          <CardContent>
            <DeploymentsTable />
          </CardContent>
        </Card>

        {/* Snapshots Panel */}
        <SnapshotsPanel />
      </main>

      <DeployDrawer open={deployDrawerOpen} onOpenChange={setDeployDrawerOpen} />
    </div>
  )
}
