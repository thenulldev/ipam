/**
 * Product-tour popover (NUL-51.C / NUL-60).
 *
 * Renders one of two shapes against the same `<TourStep>` data:
 *
 *   - **Desktop (>= 768 px):** Radix Popover anchored on the sidebar /
 *     topbar element carrying the matching `data-tour="<selector>"`. The
 *     anchor receives a focus-visible ring so the user can see exactly
 *     which control the tour is talking about, and the popover applies
 *     `aria-label={step.title}` + an `aria-describedby` link from the
 *     anchor to the popover body.
 *   - **Mobile (< 768 px):** Radix Dialog bottom sheet pinned to the
 *     bottom edge in the same `inset-x-0 bottom-0 max-h-[92dvh]` shape
 *     used by `DeviceSettingsPanel`. There is no anchor element on
 *     mobile — the relevant nav link is forced open via the
 *     `MobileNavDrawer` first, so the user can see the popover over the
 *     drawer.
 *
 * The popover buttons:
 *   - **Skip tour** is the first focusable element in tab order.
 *   - **Esc** closes the popover AND advances to the next step
 *     (matches the common Productboard/Intercom onboarding UX where
 *     dismissing a slide both dismisses and continues).
 *   - **Next** advances; the final step's CTA label is
 *     `step.cta` (typically "Got it") and completes the tour.
 *
 * The popover reads `TOUR_STEPS` and `useTour()` from the sibling modules
 * — this component is purely a view layer, all state lives in `useTour`.
 */

import { ArrowRight } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverPortal,
} from '@/components/ui/popover'
import { useIsMobile } from '@/hooks/use-media-query'

import { TOUR_STEPS, type TourStep } from './tour-data'
import { useTour } from './use-tour'

interface TourPopoverProps {
  /**
   * Currently-active step index. When `null`, the popover is unmounted.
   * Sourced from `useTour().step` by the parent provider.
   */
  step: number | null
  /**
   * Anchor element resolved by
   * `document.querySelector(\`[data-tour="${selector}"]\`)`. `null` is
   * treated as "anchor not in DOM yet" — callers should defer showing
   * until the anchor resolves (mobile drawers handle this by being
   * opened before the popover is rendered).
   */
  anchor: HTMLElement | null
  /** Called when the user skips. */
  onSkip: () => void
  /** Called when the user clicks Next / presses Esc on the popover. */
  onNext: () => void
}

export function TourPopover({ step, anchor, onSkip, onNext }: TourPopoverProps) {
  const isMobile = useIsMobile()

  if (step === null) return null

  const current: TourStep = TOUR_STEPS[step] ?? TOUR_STEPS[0]
  if (!current) return null

  if (isMobile) {
    return (
      <TourMobileSheet
        step={current}
        index={step}
        anchor={anchor}
        onSkip={onSkip}
        onNext={onNext}
      />
    )
  }

  if (!anchor) return null
  return (
    <TourDesktopPopover
      step={current}
      anchor={anchor}
      index={step}
      onSkip={onSkip}
      onNext={onNext}
    />
  )
}

// --- Desktop (Radix Popover) -------------------------------------------------

interface TourDesktopPopoverProps {
  step: TourStep
  index: number
  anchor: HTMLElement
  onSkip: () => void
  onNext: () => void
}

function TourDesktopPopover({
  step,
  index,
  anchor,
  onSkip,
  onNext,
}: TourDesktopPopoverProps) {
  const { total } = useTour()
  const bodyId = useId()
  const skipRef = useRef<HTMLButtonElement | null>(null)
  // Popper reads `getBoundingClientRect()` off this virtual ref to position
  // the popover against an element that lives outside the React tree.
  const virtualAnchorRef = useRef<HTMLElement | null>(anchor)

  // Keep the virtual ref pointed at the most recent anchor (the provider
  // re-resolves on every step + after the mobile drawer closes).
  useEffect(() => {
    virtualAnchorRef.current = anchor
  }, [anchor])

  // Apply aria-describedby + focus ring on the anchor while we own it.
  useAnchorDescription(anchor, bodyId)

  return (
    <Popover open modal={false}>
      <PopoverAnchor virtualRef={virtualAnchorRef} />
      <PopoverPortal>
        <PopoverContent
          align="start"
          side="right"
          sideOffset={12}
          aria-label={step.title}
          onOpenAutoFocus={(e) => {
            // Make Skip the first focusable element so keyboard users
            // can dismiss without tabbing through the whole card.
            e.preventDefault()
            skipRef.current?.focus()
          }}
          onEscapeKeyDown={(e) => {
            // Esc closes the popover AND advances; matches the brief.
            e.preventDefault()
            onNext()
          }}
          onInteractOutside={(e) => {
            // Clicks outside should not silently dismiss — let the user
            // explicitly skip or click Next. Prevent Radix from closing.
            e.preventDefault()
          }}
        >
          <div className="flex max-w-sm flex-col gap-3" id={bodyId}>
            <header className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {step.title}
              </h2>
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {index + 1} / {total}
              </span>
            </header>
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {step.body}
            </p>
            <footer className="mt-1 flex items-center justify-between gap-2">
              <Button
                ref={skipRef}
                type="button"
                variant="ghost"
                size="sm"
                onClick={onSkip}
                className="px-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-100"
              >
                Skip tour
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={onNext}
                className="gap-1"
              >
                {step.cta}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            </footer>
          </div>
        </PopoverContent>
      </PopoverPortal>
    </Popover>
  )
}

function useAnchorDescription(anchor: HTMLElement | null, bodyId: string) {
  useEffect(() => {
    if (!anchor) return

    const previousDescription = anchor.getAttribute('aria-describedby')
    anchor.setAttribute('aria-describedby', bodyId)
    anchor.classList.add('ring-2', 'ring-brand-500', 'ring-offset-2')

    return () => {
      if (previousDescription === null) {
        anchor.removeAttribute('aria-describedby')
      } else {
        anchor.setAttribute('aria-describedby', previousDescription)
      }
      anchor.classList.remove('ring-2', 'ring-brand-500', 'ring-offset-2')
    }
  }, [anchor, bodyId])
}

// --- Mobile (Radix Dialog bottom sheet) -------------------------------------

interface TourMobileSheetProps {
  step: TourStep
  index: number
  anchor: HTMLElement | null
  onSkip: () => void
  onNext: () => void
}

function TourMobileSheet({
  step,
  index,
  anchor,
  onSkip,
  onNext,
}: TourMobileSheetProps) {
  const { total } = useTour()
  const bodyId = useId()
  const skipRef = useRef<HTMLButtonElement | null>(null)
  useAnchorDescription(anchor, bodyId)

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onNext()
      }}
    >
      <DialogContent
        showCloseButton={false}
        aria-label={step.title}
        aria-describedby={bodyId}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          skipRef.current?.focus()
        }}
        className="inset-x-0 bottom-0 top-auto max-h-[92dvh] w-full max-w-none translate-x-0 translate-y-0 rounded-b-none rounded-t-xl p-0"
      >
        <div className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-slate-300 dark:bg-slate-600" />
        <DialogTitle className="sr-only">{step.title}</DialogTitle>
        <div className="flex max-h-[calc(92dvh-0.75rem)] min-h-0 flex-col gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
          <header className="flex items-start justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {step.title}
            </h2>
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {index + 1} / {total}
            </span>
          </header>
          <p
            id={bodyId}
            className="text-sm leading-relaxed text-slate-600 dark:text-slate-300"
          >
            {step.body}
          </p>
          <footer className="mt-1 flex items-center justify-between gap-2">
            <Button
              ref={skipRef}
              type="button"
              variant="ghost"
              size="sm"
              onClick={onSkip}
              className="px-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-100"
            >
              Skip tour
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={onNext}
              className="gap-1"
            >
              {step.cta}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  )
}
