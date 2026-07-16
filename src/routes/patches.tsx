import { createFileRoute } from '@tanstack/react-router'
import { PatchesPage } from '@/features/patches/patches-page'

export const Route = createFileRoute('/patches')({
  component: PatchesPage,
})
