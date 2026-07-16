import {
  Maximize2,
  Minus,
  Plus,
  Redo2,
  Undo2,
} from 'lucide-react'
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'

interface Props {
  /** Forwarded to a parent so the rack view can apply the zoom level. */
  zoomPercent: number
  onZoomIn: () => void
  onZoomOut: () => void
  onResetZoom: () => void
  onFullscreen: () => void
  onFitWidth?: () => void
  onFitHeight?: () => void
  onUndo?: () => void
  onRedo?: () => void
  canUndo?: boolean
  canRedo?: boolean
}

export function ToolsToolbar({
  zoomPercent,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onFullscreen,
  onFitWidth,
  onFitHeight,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: Props) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex w-10 shrink-0 flex-col items-center gap-1 border-r border-slate-200 bg-white py-3 dark:border-slate-800 dark:bg-slate-900">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onZoomIn}
              className="size-8"
              aria-label="Zoom in"
            >
              <Plus className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Zoom in</TooltipContent>
        </Tooltip>

        <div className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-[10px] font-mono tabular-nums dark:border-slate-700 dark:bg-slate-800">
          {zoomPercent}%
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onZoomOut}
              className="size-8"
              aria-label="Zoom out"
            >
              <Minus className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Zoom out</TooltipContent>
        </Tooltip>

        <button
          onClick={onResetZoom}
          className="rounded text-[9px] uppercase tracking-wider text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
        >
          reset
        </button>

        <div className="my-1 h-px w-6 bg-slate-200 dark:bg-slate-700" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onFullscreen}
              className="size-8"
              aria-label="Fullscreen"
            >
              <Maximize2 className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Fullscreen</TooltipContent>
        </Tooltip>

        {onFitWidth && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onFitWidth}
                className="size-8"
                aria-label="Fit to width"
              >
                <span className="text-[10px] font-mono">W</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Fit to width</TooltipContent>
          </Tooltip>
        )}

        {onFitHeight && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onFitHeight}
                className="size-8"
                aria-label="Fit to height"
              >
                <span className="text-[10px] font-mono">H</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Fit to height</TooltipContent>
          </Tooltip>
        )}

        <div className="my-1 h-px w-6 bg-slate-200 dark:bg-slate-700" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onUndo}
              disabled={!onUndo || !canUndo}
              className="size-8"
              aria-label="Undo"
            >
              <Undo2 className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Undo</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onRedo}
              disabled={!onRedo || !canRedo}
              className="size-8"
              aria-label="Redo"
            >
              <Redo2 className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Redo</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}