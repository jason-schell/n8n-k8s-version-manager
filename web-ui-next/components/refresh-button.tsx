'use client'

import { Button } from '@/components/ui/button'
import { RefreshCwIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface RefreshButtonProps {
  onClick: () => void
  isLoading?: boolean
  size?: 'sm' | 'default' | 'icon'
  variant?: 'ghost' | 'outline'
  className?: string
  showLabel?: boolean
}

export function RefreshButton({
  onClick,
  isLoading = false,
  size = 'sm',
  variant = 'ghost',
  className,
  showLabel = true,
}: RefreshButtonProps) {
  return (
    <Button
      variant={variant}
      size={size}
      onClick={onClick}
      disabled={isLoading}
      className={className}
    >
      <RefreshCwIcon className={cn('h-4 w-4', showLabel && 'mr-1', isLoading && 'animate-spin')} />
      {showLabel && 'Refresh'}
    </Button>
  )
}
