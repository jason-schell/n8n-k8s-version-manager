import { Card, CardContent } from '@/components/ui/card'
import { ArrowUpIcon, ArrowDownIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: string | number
  trend?: string
  trendDirection?: 'up' | 'down'
  icon?: React.ReactNode
}

export function StatCard({ label, value, trend, trendDirection, icon }: StatCardProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="text-3xl font-bold mt-1">{value}</p>
            {trend && (
              <div className="flex items-center gap-1 mt-2">
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
