export interface Version {
  version: string
  namespace: string
  mode: 'queue' | 'regular'
  status: 'running' | 'pending' | 'failed'
  pods: {
    ready: number
    total: number
  }
  url: string
}

export interface Snapshot {
  filename: string
  timestamp: string
}

export interface Infrastructure {
  postgres: {
    healthy: boolean
    status: string
  }
  redis: {
    healthy: boolean
    status: string
  }
}

export interface DeployRequest {
  version: string
  mode: 'queue' | 'regular'
  isolated_db: boolean
}

export interface ApiResponse<T = any> {
  success?: boolean
  message?: string
  error?: string
  output?: string
  data?: T
}
