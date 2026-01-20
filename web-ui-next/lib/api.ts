import type {
  Deployment,
  Snapshot,
  InfrastructureStatus,
  DeployRequest,
  AvailableVersionsResponse,
  ApiResponse,
  ClusterResources,
  SnapshotListResponse,
  CreateNamedSnapshotRequest,
  SnapshotActionResponse,
  NamespaceStatus,
} from './types'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`)
  }

  return response.json()
}

export const api = {
  // Deployments
  async getDeployments(): Promise<Deployment[]> {
    const response = await fetchApi<{ versions: Deployment[] }>('/api/versions')
    return response.versions
  },

  async deployVersion(request: DeployRequest): Promise<ApiResponse> {
    const url = new URL('/api/versions', API_URL)
    if (request.snapshot) {
      url.searchParams.append('snapshot', request.snapshot)
    }
    return fetchApi(url.pathname + url.search, {
      method: 'POST',
      body: JSON.stringify(request),
    })
  },

  async deleteDeployment(namespace: string): Promise<ApiResponse> {
    return fetchApi(`/api/versions/${namespace}`, {
      method: 'DELETE',
    })
  },

  async checkNamespaceStatus(namespace: string): Promise<NamespaceStatus> {
    return fetchApi(`/api/versions/${namespace}/status`)
  },

  // Snapshots
  async getSnapshots(): Promise<Snapshot[]> {
    const response = await fetchApi<SnapshotListResponse>('/api/snapshots')
    return response.snapshots
  },

  async getNamedSnapshots(): Promise<Snapshot[]> {
    const response = await fetchApi<SnapshotListResponse>('/api/snapshots/named')
    return response.snapshots
  },

  async createSnapshot(): Promise<ApiResponse> {
    return fetchApi('/api/snapshots/create', {
      method: 'POST',
    })
  },

  async restoreSnapshot(filename: string): Promise<ApiResponse> {
    return fetchApi('/api/snapshots/restore', {
      method: 'POST',
      body: JSON.stringify({ snapshot: filename }),
    })
  },

  async createNamedSnapshot(request: CreateNamedSnapshotRequest): Promise<SnapshotActionResponse> {
    return fetchApi('/api/snapshots/create-named', {
      method: 'POST',
      body: JSON.stringify(request),
    })
  },

  async deleteSnapshot(filename: string): Promise<SnapshotActionResponse> {
    return fetchApi(`/api/snapshots/${filename}`, {
      method: 'DELETE',
    })
  },

  // Available versions
  async getAvailableVersions(): Promise<string[]> {
    const response = await fetchApi<AvailableVersionsResponse>('/api/versions/available')
    return response.versions
  },

  // Infrastructure
  async getInfrastructureStatus(): Promise<InfrastructureStatus> {
    return fetchApi('/api/infrastructure/status')
  },

  // Cluster resources
  async getClusterResources(): Promise<ClusterResources> {
    return fetchApi('/api/cluster/resources')
  },
}
