import { useState } from 'react'
import { useChangeEvents, useTenants, useUsers } from '@/lib/queries'
import { useTenantStore } from '@/store/tenant-store'
import { Activity, Building2, ShieldCheck, UserCog } from 'lucide-react'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { avatarInitials } from '@/lib/auth'

const roleVariant: Record<string, 'success' | 'secondary' | 'outline'> = {
  admin: 'success',
  editor: 'secondary',
  viewer: 'outline',
}

export function SettingsPage() {
  const currentTenantId = useTenantStore((s) => s.currentTenantId)
  const tenants = useTenants().data ?? []
  const tenantUsers = useUsers(currentTenantId).data ?? []
  const allUsers = useUsers().data ?? []
  const { data: events = [] } = useChangeEvents({ tenantId: currentTenantId, limit: 50 })

  const [tab, setTab] = useState('overview')

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <UserCog className="size-6 text-slate-400" />
          Settings
        </h1>
        <p className="text-sm text-slate-500">
          Tenants, users, roles, and full activity history.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="users">Users & roles</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="size-4 text-slate-400" />
                Tenant
              </CardTitle>
            </CardHeader>
            <CardContent>
              {tenants
                .filter((t) => t.id === currentTenantId)
                .map((t) => (
                  <div key={t.id} className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{t.name}</div>
                      <div className="text-xs text-slate-500">
                        {t.description ?? 'No description'}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-400">
                        Created {new Date(t.createdAt).toLocaleDateString()} ·{' '}
                        {tenantUsers.length} users
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      style={{
                        background: t.brandColor ? `${t.brandColor}1f` : undefined,
                      }}
                    >
                      {t.slug}
                    </Badge>
                  </div>
                ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-slate-400" />
                Users in this tenant ({tenantUsers.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {tenantUsers.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 dark:border-slate-800"
                >
                  <div className="flex items-center gap-3">
                    <Avatar
                      className="size-8"
                      style={{ background: u.avatarColor ?? '#94a3b8' }}
                    >
                      <AvatarFallback className="text-xs text-white">
                        {avatarInitials(u)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="text-sm font-medium">{u.name}</div>
                      <div className="text-xs text-slate-500">{u.email}</div>
                    </div>
                  </div>
                  <Badge variant={roleVariant[u.role] ?? 'outline'}>
                    {u.role}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
          <p className="mt-3 text-xs text-slate-500">
            Total users across all tenants: {allUsers.length}
          </p>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="size-4 text-slate-400" />
                Recent activity ({events.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {events.map((e) => (
                <div
                  key={e.id}
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-800"
                >
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="outline" className="font-mono">{e.action}</Badge>
                    <span className="text-slate-500">
                      {e.entityType}:{e.entityId}
                    </span>
                    <span className="ml-auto text-slate-500">
                      {new Date(e.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                    {e.summary}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    by {e.actorName}
                  </div>
                </div>
              ))}
              {events.length === 0 && (
                <p className="text-xs text-slate-500">No activity yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
