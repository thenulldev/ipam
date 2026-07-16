import { createFileRoute } from '@tanstack/react-router'
import { RackDetailPage } from '@/features/racks/rack-detail-page'

export const Route = createFileRoute('/racks/$rackId')({
  component: RackDetailPage,
})
