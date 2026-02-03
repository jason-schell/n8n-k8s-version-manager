// components/infrastructure-status.tsx
'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { QUERY_CONFIG } from '@/lib/query-config'
import { Badge } from '@/components/ui/badge'
import { ServerIcon, DatabaseIcon, AlertTriangleIcon } from 'lucide-react'

export function InfrastructureStatus() {
  const { data, isLoading } = useQuery({
    queryKey: ['infrastructure'],
    queryFn: api.getInfrastructureStatus,
    staleTime: QUERY_CONFIG.infrastructure.staleTime,
    refetchInterval: QUERY_CONFIG.infrastructure.refetchInterval,
  })

  const redisHealthy = data?.redis.status === 'healthy'
  const backupHealthy = data?.backup?.status === 'healthy'
  const allHealthy = redisHealthy && backupHealthy

  // Don't show loading state in header - just hide until we know
  if (isLoading) {
    return null
  }

  // Only show if there's a problem
  if (allHealthy) {
    return null
  }

  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-destructive/10 border-b border-destructive/20">
      <AlertTriangleIcon className="h-4 w-4 text-destructive" />
      <span className="text-sm font-medium">Infrastructure Issue:</span>
      {!redisHealthy && (
        <Badge variant="destructive" className="text-xs">
          <ServerIcon className="h-3 w-3 mr-1" />
          Redis {data?.redis.status}
        </Badge>
      )}
      {!backupHealthy && (
        <Badge variant="destructive" className="text-xs">
          <DatabaseIcon className="h-3 w-3 mr-1" />
          Backups {data?.backup?.status}
        </Badge>
      )}
    </div>
  )
}
