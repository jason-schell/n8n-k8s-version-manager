'use client'

import { useState } from 'react'
import {
  LayoutDashboardIcon,
  PackageIcon,
  DatabaseIcon,
  SettingsIcon,
  ChevronLeftIcon,
  ServerIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)

  const { data: infrastructure } = useQuery({
    queryKey: ['infrastructure'],
    queryFn: api.getInfrastructureStatus,
    refetchInterval: 10000, // Poll every 10s
  })

  const navItems = [
    { icon: LayoutDashboardIcon, label: 'Dashboard', href: '/' },
    { icon: PackageIcon, label: 'Deployments', href: '/deployments' },
    { icon: DatabaseIcon, label: 'Snapshots', href: '/snapshots' },
    { icon: SettingsIcon, label: 'Settings', href: '/settings' },
  ]

  return (
    <aside
      className={cn(
        'flex flex-col border-r bg-card transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        {!collapsed && (
          <div>
            <h2 className="text-lg font-bold">n8n Manager</h2>
            <p className="text-xs text-muted-foreground">Version 1.0</p>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto"
        >
          <ChevronLeftIcon
            className={cn(
              'h-4 w-4 transition-transform',
              collapsed && 'rotate-180'
            )}
          />
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1">
        {navItems.map((item) => (
          <Button
            key={item.href}
            variant="ghost"
            className={cn(
              'w-full justify-start',
              collapsed && 'justify-center px-0'
            )}
            asChild
          >
            <a href={item.href}>
              <item.icon className={cn('h-4 w-4', !collapsed && 'mr-2')} />
              {!collapsed && item.label}
            </a>
          </Button>
        ))}
      </nav>

      {/* Infrastructure Status */}
      {!collapsed && (
        <div className="p-4 border-t space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Infrastructure
          </p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ServerIcon className="h-3 w-3" />
              <span className="text-xs">Postgres</span>
            </div>
            <Badge
              variant={
                infrastructure?.postgres.status === 'healthy'
                  ? 'default'
                  : 'destructive'
              }
              className="text-xs"
            >
              {infrastructure?.postgres.status || 'unknown'}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ServerIcon className="h-3 w-3" />
              <span className="text-xs">Redis</span>
            </div>
            <Badge
              variant={
                infrastructure?.redis.status === 'healthy'
                  ? 'default'
                  : 'destructive'
              }
              className="text-xs"
            >
              {infrastructure?.redis.status || 'unknown'}
            </Badge>
          </div>
        </div>
      )}
    </aside>
  )
}
