import type { EntityType } from '@/lib/types'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Image as ImageIcon, Trash2, MessageSquarePlus } from 'lucide-react'
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  useCreateImage,
  useCreateNote,
  useDeleteImage,
  useDeleteNote,
  useImages,
  useNotes,
  useUsers,
} from '@/lib/queries'
import { useTenantStore } from '@/store/tenant-store'
import { canWrite } from '@/lib/auth'

interface Props {
  entityType: EntityType
  entityId: string
  /** Display label shown in dialog headers (e.g. "this prefix"). */
  entityLabel?: string
}

const noteSchema = z.object({
  body: z.string().min(1, 'Note cannot be empty').max(2000),
})

const imageSchema = z.object({
  url: z.string().url('Must be a valid URL').or(z.string().startsWith('data:')),
  caption: z.string().max(200).optional(),
})

type NoteInput = z.infer<typeof noteSchema>
type ImageInput = z.infer<typeof imageSchema>

export function EntityNotesPanel({ entityType, entityId, entityLabel }: Props) {
  const tenantId = useTenantStore((s) => s.currentTenantId)
  const currentUserId = useTenantStore((s) => s.currentUserId)
  const tenantUsers = useUsers(tenantId).data ?? []
  const currentUser = tenantUsers.find((u) => u.id === currentUserId)
  const authorName = currentUser?.name ?? 'System'
  const userRole = currentUser?.role ?? 'viewer'

  const notes = useNotes(entityType, entityId).data ?? []
  const images = useImages(entityType, entityId).data ?? []
  const createNote = useCreateNote()
  const deleteNote = useDeleteNote()
  const createImage = useCreateImage()
  const deleteImage = useDeleteImage()

  const [noteOpen, setNoteOpen] = useState(false)
  const [imageOpen, setImageOpen] = useState(false)

  const noteForm = useForm<NoteInput>({
    resolver: zodResolver(noteSchema),
    defaultValues: { body: '' },
  })
  const imageForm = useForm<ImageInput>({
    resolver: zodResolver(imageSchema),
    defaultValues: { url: '', caption: '' },
  })

  const onAddNote = (data: NoteInput) => {
    createNote.mutate(
      {
        tenantId,
        authorId: currentUserId,
        authorName,
        body: data.body,
        entityType,
        entityId,
      },
      { onSuccess: () => { setNoteOpen(false); noteForm.reset() } },
    )
  }

  const onAddImage = (data: ImageInput) => {
    createImage.mutate(
      {
        tenantId,
        authorId: currentUserId,
        authorName,
        url: data.url,
        caption: data.caption || undefined,
        entityType,
        entityId,
      },
      { onSuccess: () => { setImageOpen(false); imageForm.reset() } },
    )
  }

  const writable = canWrite(userRole)

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">Notes</h4>
          {writable && (
            <Button size="sm" variant="outline" onClick={() => setNoteOpen(true)}>
              <MessageSquarePlus className="size-4" />
              Add note
            </Button>
          )}
        </div>
        <ul className="mt-3 space-y-2">
          {notes.length === 0 && (
            <li className="text-xs text-slate-500">No notes yet.</li>
          )}
          {notes.map((n) => (
            <li
              key={n.id}
              className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="grid size-7 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
                    {n.authorName.split(/\s+/).map((p) => p[0]).slice(0, 2).join('')}
                  </span>
                  <div className="leading-tight">
                    <div className="text-sm font-medium">{n.authorName}</div>
                    <div className="text-[11px] text-slate-500">
                      {new Date(n.createdAt).toLocaleString()}
                    </div>
                  </div>
                </div>
                {writable && (
                  <button
                    onClick={() => deleteNote.mutate(n.id)}
                    className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-slate-700 dark:text-slate-200">
                {n.body}
              </p>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">Images</h4>
          {writable && (
            <Button size="sm" variant="outline" onClick={() => setImageOpen(true)}>
              <ImageIcon className="size-4" />
              Attach image
            </Button>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.length === 0 && (
            <p className="col-span-full text-xs text-slate-500">No images yet.</p>
          )}
          {images.map((img) => (
            <figure
              key={img.id}
              className="overflow-hidden rounded-md border border-slate-200 dark:border-slate-800"
            >
              <img
                src={img.url}
                alt={img.caption ?? ''}
                className="aspect-video w-full bg-slate-100 object-cover dark:bg-slate-800"
              />
              <figcaption className="flex items-center justify-between p-2 text-xs">
                <span className="truncate">{img.caption ?? '—'}</span>
                {writable && (
                  <button
                    onClick={() => deleteImage.mutate(img.id)}
                    className="text-slate-400 hover:text-rose-600"
                  >
                    <Trash2 className="size-3" />
                  </button>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a note</DialogTitle>
            <DialogDescription>
              Visible to everyone in this tenant. Notes are tracked in history.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={noteForm.handleSubmit(onAddNote)} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="note-body">Note</Label>
              <textarea
                id="note-body"
                rows={4}
                className="flex w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                {...noteForm.register('body')}
              />
              {noteForm.formState.errors.body && (
                <p className="text-xs text-rose-600">
                  {noteForm.formState.errors.body.message}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setNoteOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createNote.isPending}>
                {createNote.isPending ? 'Saving…' : 'Save note'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={imageOpen} onOpenChange={setImageOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Attach an image</DialogTitle>
            <DialogDescription>
              Provide a URL (or paste a data: URL).{' '}
              {entityLabel && (
                <span className="text-slate-400">
                  Attaches to {entityLabel}.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={imageForm.handleSubmit(onAddImage)} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="img-url">Image URL</Label>
              <Input
                id="img-url"
                placeholder="https:// or data:image/..."
                {...imageForm.register('url')}
              />
              {imageForm.formState.errors.url && (
                <p className="text-xs text-rose-600">
                  {imageForm.formState.errors.url.message}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="img-caption">Caption (optional)</Label>
              <Input
                id="img-caption"
                placeholder="Front panel label, serial sticker, etc."
                {...imageForm.register('caption')}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setImageOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createImage.isPending}>
                {createImage.isPending ? 'Saving…' : 'Attach image'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}