import { createFileRoute } from '@tanstack/react-router'
import { RacksListPage } from '@/features/racks/racks-list-page'

export const Route = createFileRoute('/racks/')({
  component: RacksListPage,
})
