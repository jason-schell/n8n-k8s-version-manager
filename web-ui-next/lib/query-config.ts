// Centralized query timing configuration for React Query
// This ensures consistent polling and caching behavior across the application

export const QUERY_CONFIG = {
  // Deployments: moderate polling, status can change
  // Uses smart polling - faster when deployments are pending
  deployments: {
    staleTime: 5000,
    refetchInterval: 15000,
    refetchIntervalPending: 5000, // faster when deployments are starting
  },

  // Pods/Events: fast polling for real-time status in details drawer
  pods: {
    staleTime: 2000,
    refetchInterval: 5000,
  },
  events: {
    staleTime: 2000,
    refetchInterval: 5000,
  },

  // Logs: slightly slower polling than pods/events
  logs: {
    staleTime: 5000,
    refetchInterval: 10000,
  },

  // Config: static, rarely changes once deployed
  config: {
    staleTime: 5 * 60 * 1000, // 5 minutes
  },

  // Snapshots: slow polling, manual action triggers changes
  snapshots: {
    staleTime: 30000,
    refetchInterval: 30000,
  },

  // Infrastructure: background health check for Redis and backups
  infrastructure: {
    staleTime: 30000,
    refetchInterval: 30000,
  },

  // Available versions: from GitHub, very stable
  availableVersions: {
    staleTime: 5 * 60 * 1000, // 5 minutes
  },

  // Named snapshots: used in deploy drawer for initial data selection
  namedSnapshots: {
    staleTime: 60000, // 1 minute
  },

  // Cluster resources: moderate polling when deploy drawer is open
  clusterResources: {
    staleTime: 5000,
    refetchInterval: 5000,
  },
} as const
