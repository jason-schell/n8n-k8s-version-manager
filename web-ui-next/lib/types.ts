export interface Deployment {
  namespace: string
  name?: string
  version: string
  status: 'running' | 'pending' | 'failed' | 'unknown'
  mode: 'queue' | 'regular' | ''
  url?: string  // Optional - may not exist for new deployments
  isolated_db: boolean
  snapshot?: string  // Snapshot name if deployed with one
  created_at?: string
}

export interface Snapshot {
  filename: string
  name?: string
  type: 'named' | 'auto'
  timestamp?: string
  created?: string
  size?: string
  source?: string
}

export interface SnapshotListResponse {
  snapshots: Snapshot[]
}

export interface CreateNamedSnapshotRequest {
  name: string
  source?: string
}

export interface SnapshotActionResponse {
  success: boolean
  message?: string
  error?: string
  output?: string
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
  name?: string
  snapshot?: string
  helm_values?: HelmValues
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

export interface NamespaceStatus {
  exists: boolean
  namespace: string
}

export interface EnvVar {
  key: string
  value: string
}

export interface ResourceSpec {
  requests?: { cpu?: string; memory?: string }
  limits?: { cpu?: string; memory?: string }
}

export interface HelmValues {
  // Database settings
  database?: {
    isolated?: {
      image?: string
      storage?: {
        size?: string
      }
    }
  }

  // Redis settings (queue mode only)
  redis?: {
    host?: string
    port?: number
  }

  // n8n configuration
  n8nConfig?: {
    encryptionKey?: string
    timezone?: string
    webhookUrl?: string
  }

  // Resources for containers
  resources?: {
    main?: ResourceSpec
    worker?: ResourceSpec
    webhook?: ResourceSpec
  }

  // Replicas
  replicas?: {
    workers?: number
  }

  // Service configuration
  service?: {
    type?: 'NodePort' | 'LoadBalancer' | 'ClusterIP'
  }

  // Extra environment variables
  extraEnv?: Record<string, string>

  // Raw YAML override (merged last, takes precedence)
  rawYaml?: string
}

// Legacy interface - kept for backward compatibility
export interface CustomValues {
  envVars?: EnvVar[]
  resources?: {
    cpu?: string
    memory?: string
  }
  workerReplicas?: number
  rawYaml?: string
}

// K8s Observability types
export interface K8sEvent {
  type: 'Normal' | 'Warning'
  reason: string
  message: string
  timestamp: string
  count: number
  object: {
    kind: string
    name: string
  }
}

export interface ContainerStatus {
  name: string
  ready: boolean
  state: 'running' | 'waiting' | 'terminated' | 'unknown'
  state_detail?: string
  restart_count: number
}

export interface PodStatus {
  name: string
  phase: 'Pending' | 'Running' | 'Succeeded' | 'Failed' | 'Unknown'
  containers: ContainerStatus[]
  created: string
}

export interface PodLogs {
  pod: string
  container?: string
  logs: string
  error?: string
}

export interface EventsResponse {
  events: K8sEvent[]
}

export interface PodsResponse {
  pods: PodStatus[]
}

export interface LogsResponse {
  logs: PodLogs[]
}
