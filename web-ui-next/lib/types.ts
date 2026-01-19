export interface Deployment {
  namespace: string
  name?: string
  version: string
  status: 'running' | 'pending' | 'failed' | 'unknown'
  mode: 'queue' | 'regular' | ''
  url?: string  // Optional - may not exist for new deployments
  isolated_db: boolean
  created_at?: string
}

export interface Snapshot {
  filename: string
  timestamp: string
}

export interface InfrastructureStatus {
  postgres: {
    status: 'healthy' | 'unhealthy'
    message?: string
  }
  redis: {
    status: 'healthy' | 'unhealthy'
    message?: string
  }
}

export interface DeployRequest {
  version: string
  mode: 'queue' | 'regular'
  isolated_db: boolean
  name?: string
}

export interface AvailableVersionsResponse {
  versions: string[]
}

export interface ApiResponse<T = unknown> {
  success: boolean
  message?: string
  error?: string
  data?: T
}

export interface ClusterMemory {
  allocatable_mi: number
  used_mi: number
  available_mi: number
  utilization_percent: number
}

export interface ClusterDeployment {
  namespace: string
  memory_mi: number
  mode: 'queue' | 'regular'
  age_seconds: number
}

export interface ClusterResources {
  error?: string
  memory: ClusterMemory | null
  can_deploy: {
    queue_mode: boolean
    regular_mode: boolean
  }
  deployments: ClusterDeployment[]
}
