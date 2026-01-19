import type { Version, Snapshot, Infrastructure, DeployRequest, ApiResponse } from './types'

const API_BASE = '/api'

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }

  return response.json()
}

export const api = {
  // Version management
  listVersions: async (): Promise<{ versions: Version[] }> => {
    return fetchJson(`${API_BASE}/versions`)
  },

  deployVersion: async (request: DeployRequest): Promise<ApiResponse> => {
    return fetchJson(`${API_BASE}/versions`, {
      method: 'POST',
      body: JSON.stringify(request),
    })
  },

  removeVersion: async (version: string): Promise<ApiResponse> => {
    return fetchJson(`${API_BASE}/versions/${version}`, {
      method: 'DELETE',
    })
  },

  // Snapshot management
  listSnapshots: async (): Promise<{ snapshots: Snapshot[] }> => {
    return fetchJson(`${API_BASE}/snapshots`)
  },

  restoreSnapshot: async (snapshot: string): Promise<ApiResponse> => {
    return fetchJson(`${API_BASE}/snapshots/restore`, {
      method: 'POST',
      body: JSON.stringify({ snapshot }),
    })
  },

  createSnapshot: async (): Promise<ApiResponse> => {
    return fetchJson(`${API_BASE}/snapshots/create`, {
      method: 'POST',
    })
  },

  // Available versions
  getAvailableVersions: async (): Promise<{ versions: string[] }> => {
    return fetchJson(`${API_BASE}/versions/available`)
  },

  // Infrastructure
  getInfrastructureStatus: async (): Promise<Infrastructure> => {
    return fetchJson(`${API_BASE}/infrastructure/status`)
  },

  // Health check
  healthCheck: async (): Promise<{ status: string }> => {
    return fetchJson(`${API_BASE}/health`)
  },
}
