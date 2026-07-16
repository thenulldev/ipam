import { createFileRoute } from '@tanstack/react-router'
import { FloorplanPage } from '@/features/floorplan/floorplan-page'

export const Route = createFileRoute('/floorplan')({
  component: FloorplanPage,
})
