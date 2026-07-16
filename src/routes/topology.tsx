import { createFileRoute } from '@tanstack/react-router'
import { TopologyPage } from '@/features/topology/topology-page'

export const Route = createFileRoute('/topology')({
  component: TopologyPage,
})