'use client'

import { Sidebar } from '@/components/sidebar'
import { StatCard } from '@/components/stat-card'
import { Button } from '@/components/ui/button'
import { PlusIcon, PackageIcon, DatabaseIcon, HardDriveIcon } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export default function Home() {
  const { data: deployments } = useQuery({
    queryKey: ['deployments'],
    queryFn: api.getDeployments,
  })

  const { data: snapshots } = useQuery({
    queryKey: ['snapshots'],
    queryFn: api.getSnapshots,
  })

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8 space-y-6">
        {/* Hero Section */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">n8n Version Manager</h1>
            <p className="text-muted-foreground mt-1">
              {deployments?.length || 0} active deployments
            </p>
          </div>
          <Button size="lg">
            <PlusIcon className="h-4 w-4 mr-2" />
            Deploy New Version
          </Button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Active Deployments"
            value={deployments?.length || 0}
            trend="+1"
            trendDirection="up"
            icon={<PackageIcon className="h-8 w-8" />}
          />
          <StatCard
            label="Snapshots"
            value={snapshots?.length || 0}
            icon={<DatabaseIcon className="h-8 w-8" />}
          />
          <StatCard
            label="Disk Used"
            value="2.4 GB"
            icon={<HardDriveIcon className="h-8 w-8" />}
          />
          <StatCard
            label="Uptime"
            value="99.9%"
            trend="+0.1%"
            trendDirection="up"
          />
        </div>

        {/* Placeholder for deployments table */}
        <div className="border-2 border-dashed rounded-lg p-12 text-center text-muted-foreground">
          Deployments table coming next...
        </div>
      </main>
    </div>
  )
}
