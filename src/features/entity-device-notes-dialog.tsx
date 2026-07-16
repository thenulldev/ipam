import { History, MessageSquarePlus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { useDevice } from '@/lib/queries'
import type { DeviceId } from '@/lib/types'
import { EntityNotesPanel } from './entity-notes-panel'
import { EntityHistoryPanel } from './entity-history-panel'

interface Props {
  deviceId: DeviceId | null
  onOpenChange: (open: boolean) => void
}

export function DeviceNotesDialog({ deviceId, onOpenChange }: Props) {
  const open = deviceId !== null
  const device = useDevice(deviceId ?? undefined).data

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{device?.name ?? 'Device'}</DialogTitle>
          <DialogDescription>
            Notes, images, and audit trail for this device.
          </DialogDescription>
        </DialogHeader>
        {device && (
          <Tabs defaultValue="notes">
            <TabsList>
              <TabsTrigger value="notes">
                <MessageSquarePlus className="size-3.5" />
                Notes
              </TabsTrigger>
              <TabsTrigger value="history">
                <History className="size-3.5" />
                History
              </TabsTrigger>
            </TabsList>
            <TabsContent value="notes">
              <EntityNotesPanel
                entityType="device"
                entityId={device.id}
                entityLabel={device.name}
              />
            </TabsContent>
            <TabsContent value="history">
              <EntityHistoryPanel entityType="device" entityId={device.id} />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}