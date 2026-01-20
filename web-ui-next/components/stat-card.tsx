import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowUpIcon, ArrowDownIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: string | number
  trend?: string
  trendDirection?: 'up' | 'down'
  icon?: React.ReactNode
  isLoading?: boolean
}

export function StatCard({ label, value, trend, trendDirection, icon, isLoading }: StatCardProps) {
  return (
    <Card>
      <CardContent className="py-4 px-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            {isLoading ? (
              <Skeleton className="h-8 w-16 mt-1" />
            ) : (
              <p className="text-2xl font-bold mt-1">{value}</p>
            )}
            {trend && !isLoading && (
              <div className="flex items-center gap-1 mt-1">
                {trendDirection === 'up' && (
                  <ArrowUpIcon className="h-3 w-3 text-green-500" />
                )}
                {trendDirection === 'down' && (
                  <ArrowDownIcon className="h-3 w-3 text-red-500" />
                )}
                <span
                  className={cn(
                    'text-xs font-medium',
                    trendDirection === 'up' && 'text-green-500',
                    trendDirection === 'down' && 'text-red-500'
                  )}
                >
                  {trend}
                </span>
              </div>
            )}
          </div>
          {icon && <div className="text-muted-foreground">{icon}</div>}
        </div>
      </CardContent>
    </Card>
  )
}
