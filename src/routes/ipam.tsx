import { createFileRoute } from '@tanstack/react-router'
import { IpamPage } from '@/features/ipam/ipam-page'

export const Route = createFileRoute('/ipam')({
  component: IpamPage,
})
