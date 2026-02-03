/**
 * Format memory in Mi to human-readable string
 */
export function formatMemory(mi: number): string {
  if (mi >= 1024) {
    return `${(mi / 1024).toFixed(1)} GB`
  }
  return `${mi} MB`
}

/**
 * Get color class based on memory utilization percentage
 */
export function getMemoryUtilizationColor(percent: number): {
  bg: string
  text: string
  border: string
} {
  if (percent >= 85) {
    return {
      bg: 'bg-red-50',
      text: 'text-red-700',
      border: 'border-red-200',
    }
  }
  if (percent >= 70) {
    return {
      bg: 'bg-yellow-50',
      text: 'text-yellow-700',
      border: 'border-yellow-200',
    }
  }
  return {
    bg: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-200',
  }
}

/**
 * Format age in seconds to human-readable string
 */
export function formatAge(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${mins % 60}m`
  if (mins > 0) return `${mins}m`
  return `${seconds}s`
}

/**
 * Calculate age in seconds from an ISO date string
 */
export function getAgeSeconds(isoDate: string | undefined): number {
  if (!isoDate) return Infinity
  const created = new Date(isoDate)
  const now = new Date()
  return Math.floor((now.getTime() - created.getTime()) / 1000)
}

/**
 * Format age from an ISO date string to human-readable string
 */
export function formatAgeFromDate(isoDate: string | undefined): string {
  if (!isoDate) return '-'
  return formatAge(getAgeSeconds(isoDate))
}
