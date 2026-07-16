import { useState } from 'react'
import type { Cable, Device, Port, PortId, Rack, RackReservation } from '@/lib/types'
import { useEditorStore } from '@/store/editor-store'
import { cn } from '@/lib/utils'

interface RackViewProps {
  rack: Rack
  devices: Device[]
  portsByDevice?: Record<string, Port[]>
  cables?: Cable[]
  allDevices?: Device[]
  reservations?: RackReservation[]
  side?: 'front' | 'rear'
  onDropTemplate?: (templateId: string, uStart: number) => void
  onMoveDevice?: (deviceId: string, uStart: number) => void
  defaultUHeight?: number
  readOnly?: boolean
  onPortClick?: (portId: PortId) => void
  selectedPortId?: PortId | null
  highlightedPortId?: PortId | null
  onConnectionClick?: (cableId: string) => void
}

const U_PX = 22

interface PortPos {
  portId: PortId
  x: number
  y: number
  deviceName: string
  portLabel: string
}

export interface InternalCable {
  cable: Cable
  from: PortPos
  to: PortPos
}
export interface ExternalCable {
  cable: Cable
  inRack: PortPos
  outDirection: 'in' | 'out'
}

function portPositionOnDevice(
  _port: Port,
  portIndex: number,
  portCount: number,
  deviceWidth: number,
  leftPadding: number,
): number {
  if (portCount <= 1) return leftPadding + deviceWidth / 2
  return leftPadding + ((portIndex + 0.5) / portCount) * deviceWidth
}

function deviceTopY(d: Device, totalHeight: number): number {
  const topFromBottom = (d.uStart - 1) * U_PX
  const height = d.uHeight * U_PX
  return totalHeight - topFromBottom - height
}

function cableColor(c: Cable): string {
  const color = (c as any).color
  if (color && typeof color === 'string') return color
  return '#0ea5e9'
}

export function RackView({
  rack,
  devices,
  portsByDevice = {},
  cables = [],
  allDevices: _allDevices = [],
  reservations = [],
  side = 'front',
  onDropTemplate,
  onMoveDevice,
  defaultUHeight = 1,
  readOnly,
  onPortClick,
  selectedPortId,
  highlightedPortId,
  onConnectionClick,
}: RackViewProps) {
  const selectedDeviceId = useEditorStore((s) => s.selectedDeviceId)
  const selectDevice = useEditorStore((s) => s.selectDevice)
  const highlightedCableId = useEditorStore((s) => s.highlightedCableId)

  const [dragHoverU, setDragHoverU] = useState<{
    uStart: number
    uHeight: number
    kind: 'template' | 'device' | null
  } | null>(null)

  const totalHeight = rack.uHeight * U_PX

  const portPositions = new Map<string, PortPos>()
  const faceKindFilter = (kind: string) => {
    if (side === 'front') {
      return !['power-c13', 'power-c19', 'console-rj45', 'console-usb', 'usb-a'].includes(kind)
    }
    return ['console-rj45', 'console-usb', 'usb-a'].includes(kind)
  }

  for (const d of devices) {
    if (d.face !== side) continue
    const ports = (portsByDevice[d.id] ?? []).filter((p) => faceKindFilter(p.kind))
    if (ports.length === 0) continue
    const sorted = ports.slice().sort((a, b) => a.position - b.position)
    const devTop = deviceTopY(d, totalHeight)
    const devHeight = d.uHeight * U_PX
    const devWidth = 288 - 8
    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i]!
      const x = portPositionOnDevice(p, i, sorted.length, devWidth, 4)
      const y = devTop + devHeight / 2
      portPositions.set(p.id, {
        portId: p.id,
        x,
        y,
        deviceName: d.name,
        portLabel: p.label,
      })
    }
  }

  const internal: InternalCable[] = []
  const external: ExternalCable[] = []

  for (const c of cables) {
    const pa = portPositions.get(c.portA)
    const pb = portPositions.get(c.portB)
    if (pa && pb) {
      internal.push({ cable: c, from: pa, to: pb })
    } else if (pa) {
      external.push({ cable: c, inRack: pa, outDirection: 'in' })
    } else if (pb) {
      external.push({ cable: c, inRack: pb, outDirection: 'out' })
    }
  }

  const inboundCount = external.filter((e) => e.outDirection === 'in').length
  const outboundCount = external.filter((e) => e.outDirection === 'out').length

  const computeUFromEvent = (
    e: React.DragEvent,
  ): { uStart: number; templateId?: string; deviceId?: string } => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const yInRack = e.clientY - rect.top
    const uFromTop = Math.max(0, Math.min(rack.uHeight - 1, Math.floor(yInRack / U_PX)))
    const uStart = Math.max(1, rack.uHeight - uFromTop)
    const templateId = e.dataTransfer.getData('application/x-template-id') || undefined
    const deviceId = e.dataTransfer.getData('application/x-device-id') || undefined
    return { uStart, templateId, deviceId }
  }

  const onDragOver = (e: React.DragEvent) => {
    if (readOnly) return
    if (!e.dataTransfer.types.includes('application/x-template-id') &&
        !e.dataTransfer.types.includes('application/x-device-id')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const { uStart, templateId, deviceId } = computeUFromEvent(e)
    const kind: 'template' | 'device' | null = templateId
      ? 'template'
      : deviceId
        ? 'device'
        : null
    const draggingDevice = deviceId
      ? devices.find((d) => d.id === deviceId)
      : undefined
    const uHeight = draggingDevice?.uHeight ?? defaultUHeight
    setDragHoverU({ uStart, uHeight, kind })
  }

  const onDragLeave = () => setDragHoverU(null)

  const onDrop = (e: React.DragEvent) => {
    if (readOnly) return
    e.preventDefault()
    const { uStart, templateId, deviceId } = computeUFromEvent(e)
    setDragHoverU(null)
    if (templateId && onDropTemplate) {
      onDropTemplate(templateId, uStart)
    } else if (deviceId && onMoveDevice) {
      onMoveDevice(deviceId, uStart)
    }
  }

  // Mouse wheel zoom
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    // Wheel is handled at the parent (rack-detail-page) for fullscreen
    // This is a placeholder; we let the parent handle it.
    void e
  }

  return (
    <div className="flex w-full justify-center">
      <div className="relative shrink-0" onWheel={onWheel}>
        <div
          className={cn(
            'relative w-80 rounded-md border-x-4 border-slate-700 bg-slate-100 shadow-inner dark:bg-slate-800/40',
            !readOnly && 'transition-colors',
            dragHoverU && 'ring-2 ring-brand-400 ring-inset',
          )}
          style={{ height: totalHeight }}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <div className="pointer-events-none absolute inset-0">
            {Array.from({ length: rack.uHeight + 1 }, (_, i) => {
              const u = rack.uHeight - i
              return (
                <div
                  key={u}
                  className="absolute left-0 right-0 flex items-center justify-between px-2 text-[9px] font-medium text-slate-400"
                  style={{
                    top: i * U_PX,
                    height: U_PX,
                    borderTop: i === 0 ? 'none' : '1px dashed rgba(100,116,139,0.15)',
                  }}
                >
                  <span>{u}</span>
                  <div className="h-px flex-1" />
                </div>
              )
            })}
          </div>

          {reservations.map((r) => {
            const topFromBottom = (r.uStart - 1) * U_PX
            const height = r.uHeight * U_PX
            const top = totalHeight - topFromBottom - height
            return (
              <div
                key={r.id}
                className="pointer-events-none absolute inset-x-1 z-0 flex flex-col items-center justify-center overflow-hidden rounded-[3px] border border-dashed text-[10px] font-medium leading-tight opacity-70"
                style={{
                  top,
                  height,
                  background: `${r.color}33`,
                  borderColor: r.color,
                  color: r.color,
                }}
              >
                <div className="truncate px-1">{r.label}</div>
              </div>
            )
          })}

          {internal.length > 0 && (
            <svg
              className="pointer-events-none absolute inset-0 z-10"
              width={288}
              height={totalHeight}
              viewBox={`0 0 288 ${totalHeight}`}
            >
              {internal.map(({ cable, from, to }) => {
                const isHighlighted = highlightedCableId === cable.id
                const dim = highlightedCableId && !isHighlighted ? 0.18 : 0.75
                const stroke = isHighlighted ? '#f97316' : cableColor(cable)
                const sw = isHighlighted ? 2.5 : 1.5
                const midY = (from.y + to.y) / 2 - 14
                const d = `M ${from.x} ${from.y} Q ${from.x} ${midY}, ${(from.x + to.x) / 2} ${midY} T ${to.x} ${to.y}`
                return (
                  <g
                    key={cable.id}
                    opacity={dim}
                    style={{ cursor: 'pointer' }}
                    onClick={() => onConnectionClick?.(cable.id)}
                  >
                    <path
                      d={d}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={sw}
                      strokeLinecap="round"
                      pointerEvents="auto"
                    />
                    <circle cx={from.x} cy={from.y} r={2.5} fill={stroke} />
                    <circle cx={to.x} cy={to.y} r={2.5} fill={stroke} />
                  </g>
                )
              })}
            </svg>
          )}

          {external.length > 0 && (
            <ExternalCableIndicators
              externals={external}
              onClick={(cableId) => onConnectionClick?.(cableId)}
            />
          )}

          {dragHoverU && (
            <div
              className="pointer-events-none absolute inset-x-1 z-30 rounded-sm border-2 border-dashed border-brand-500 bg-brand-200/40"
              style={{
                top: totalHeight - (dragHoverU.uStart - 1 + dragHoverU.uHeight) * U_PX,
                height: dragHoverU.uHeight * U_PX,
              }}
            >
              <div className="grid h-full place-items-center text-[10px] font-semibold text-brand-700">
                U{dragHoverU.uStart}–U{dragHoverU.uStart + dragHoverU.uHeight - 1}
              </div>
            </div>
          )}

          {devices.map((d) => {
            const topFromBottom = (d.uStart - 1) * U_PX
            const height = d.uHeight * U_PX
            const top = totalHeight - topFromBottom - height
            const isSelected = d.id === selectedDeviceId
            const matchesSide = d.face === side
            const devicePorts = portsByDevice[d.id] ?? []
            const portsOnFace = devicePorts.filter((p) => faceKindFilter(p.kind))
            const portsToShow = portsOnFace.length > 0 ? portsOnFace : devicePorts
            return (
              <button
                key={d.id}
                draggable={!readOnly && !!onMoveDevice}
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-device-id', d.id)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onClick={() => selectDevice(d.id)}
                className={cn(
                  'absolute inset-x-1 z-20 flex flex-col items-stretch overflow-hidden rounded-[3px] border text-left transition-shadow',
                  d.kind === 'patchbox-cassette' && matchesSide
                    ? 'border-cyan-500/60 bg-cyan-50/80 dark:border-cyan-700/40 dark:bg-cyan-950/40'
                    : matchesSide
                      ? 'border-slate-700/40 bg-white/70 text-slate-700 hover:bg-white dark:bg-slate-900/70 dark:text-slate-200'
                      : 'border-slate-300/30 bg-slate-200/60 text-slate-400 hover:bg-slate-200 dark:border-slate-700/40 dark:bg-slate-800/40 dark:text-slate-500',
                  isSelected &&
                    matchesSide &&
                    'z-30 ring-2 ring-brand-500 ring-offset-2 ring-offset-slate-100 dark:ring-offset-slate-800/40',
                  onMoveDevice && 'cursor-grab active:cursor-grabbing',
                )}
                style={{ top, height }}
                title={`${d.name} · ${d.kind} · ${d.face}`}
              >
                <div className="flex h-full flex-col px-1.5 py-0.5">
                  <div
                    className={cn(
                      'flex shrink-0 items-center gap-1 truncate text-[10px] font-semibold',
                      height < U_PX * 1.5 && 'leading-none',
                    )}
                  >
                    {d.kind === 'patchbox-cassette' && (
                      <span className="text-[8px] uppercase tracking-wider opacity-70">
                        ◯
                      </span>
                    )}
                    <span className="truncate">{d.name}</span>
                  </div>

                  {matchesSide && portsToShow.length > 0 && height >= U_PX && (
                    <DevicePortGrid
                      ports={portsToShow}
                      selectedPortId={highlightedPortId ?? selectedPortId ?? null}
                      onPortClick={onPortClick}
                    />
                  )}
                </div>
              </button>
            )
          })}
        </div>

        <div className="absolute -right-7 top-0 flex h-full flex-col items-center justify-between py-2 text-[10px] font-medium uppercase tracking-wider text-slate-400">
          <span>{side === 'front' ? 'F' : 'B'}</span>
          <span>{side === 'front' ? 'FRONT' : 'REAR'}</span>
          <span>{side === 'front' ? 'F' : 'B'}</span>
        </div>

        {(inboundCount > 0 || outboundCount > 0) && (
          <div className="absolute -top-6 left-0 right-0 flex justify-center gap-2 text-[10px]">
            {outboundCount > 0 && (
              <span className="flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-800 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-200">
                ↑ {outboundCount} outbound
              </span>
            )}
            {inboundCount > 0 && (
              <span className="flex items-center gap-1 rounded-md border border-sky-300 bg-sky-50 px-1.5 py-0.5 font-semibold text-sky-800 dark:border-sky-700/50 dark:bg-sky-950/40 dark:text-sky-200">
                ↓ {inboundCount} inbound
              </span>
            )}
          </div>
        )}

        {external.length > 0 && (
          <ExternalCableStubs
            externals={external}
            portPositions={portPositions}
            onClick={(cableId) => onConnectionClick?.(cableId)}
          />
        )}
      </div>
    </div>
  )
}

function ExternalCableIndicators({
  externals,
  onClick,
}: {
  externals: ExternalCable[]
  onClick: (cableId: string) => void
}) {
  return (
    <>
      {externals.map(({ cable, inRack, outDirection }) => (
        <button
          key={cable.id}
          onClick={() => onClick(cable.id)}
          className={cn(
            'absolute z-30 grid size-4 place-items-center rounded-sm border text-[10px] font-bold shadow-sm',
            outDirection === 'out'
              ? 'border-amber-400 bg-amber-100 text-amber-800 hover:bg-amber-200 dark:border-amber-700 dark:bg-amber-950/80 dark:text-amber-200'
              : 'border-sky-400 bg-sky-100 text-sky-800 hover:bg-sky-200 dark:border-sky-700 dark:bg-sky-950/80 dark:text-sky-200',
          )}
          style={{
            top: inRack.y - 8,
            left: inRack.x - 8,
          }}
          title={`${outDirection === 'out' ? 'Outbound' : 'Inbound'} cable: ${cable.label ?? cable.id}`}
        >
          {outDirection === 'out' ? '↗' : '↙'}
        </button>
      ))}
    </>
  )
}

function ExternalCableStubs({
  externals,
  portPositions,
  onClick,
}: {
  externals: ExternalCable[]
  portPositions: Map<string, PortPos>
  onClick: (cableId: string) => void
}) {
  return (
    <svg
      className="pointer-events-none absolute -bottom-12 -left-6 -right-6 z-0 h-12"
      width={288 + 48}
      height={48}
      viewBox={`0 0 ${288 + 48} 48`}
    >
      {externals.map(({ cable, inRack, outDirection }) => {
        if (!portPositions.has(inRack.portId)) return null
        const color = cableColor(cable)
        const stubX = inRack.x
        const stubY1 = 0
        const stubY2 = 24
        const stubX2 = outDirection === 'out' ? 288 + 48 : 0
        return (
          <g
            key={cable.id}
            style={{ cursor: 'pointer' }}
            onClick={() => onClick(cable.id)}
          >
            <path
              d={`M ${stubX} ${stubY1} L ${stubX} ${stubY2} L ${stubX2} ${stubY2}`}
              fill="none"
              stroke={color}
              strokeWidth={1.5}
              opacity={0.7}
            />
            <circle cx={stubX} cy={stubY2} r={2} fill={color} />
            <text
              x={stubX}
              y={stubY2 + 12}
              textAnchor="middle"
              fontSize={8}
              fill={color}
              opacity={0.9}
            >
              {cable.label ?? cable.id.slice(-4)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function DevicePortGrid({
  ports,
  selectedPortId,
  onPortClick,
}: {
  ports: Port[]
  selectedPortId: PortId | null
  onPortClick?: (portId: PortId) => void
}) {
  const [hovered, setHovered] = useState<PortId | null>(null)
  const sorted = ports.slice().sort((a, b) => a.position - b.position)
  const perRow = 24

  return (
    <div
      className="grid w-full flex-1 gap-px"
      style={{
        gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))`,
        gridAutoRows: 'minmax(0, 1fr)',
      }}
    >
      {sorted.map((p) => {
        const isConnected = !!p.cableId
        const isSelected = selectedPortId === p.id
        const isHovered = hovered === p.id
        const label = p.label.length > 4 ? p.label.slice(0, 4) + '…' : p.label
        return (
          <button
            key={p.id}
            onClick={(e) => {
              e.stopPropagation()
              onPortClick?.(p.id)
            }}
            onMouseEnter={() => setHovered(p.id)}
            onMouseLeave={() => setHovered(null)}
            className={cn(
              'group relative flex flex-col items-center justify-end transition-all',
              isSelected
                ? 'z-10 ring-1 ring-brand-500 ring-offset-1 ring-offset-slate-100 dark:ring-offset-slate-800'
                : isHovered
                  ? 'z-10 ring-1 ring-slate-400'
                  : '',
            )}
            title={`${p.label} · ${p.kind}${isConnected ? ' · connected' : ''}`}
          >
            <span
              className={cn(
                'block w-full border',
                isConnected
                  ? 'border-sky-400 bg-sky-100 dark:border-sky-700 dark:bg-sky-950/60'
                  : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900',
              )}
              style={{ height: '55%', minHeight: 3 }}
            >
              {isConnected && (
                <span className="absolute inset-x-0 top-1/2 mx-auto block h-1 w-1 -translate-y-1/2 rounded-full bg-sky-500" />
              )}
            </span>
            <span
              className={cn(
                'mt-px truncate font-mono text-[7px] leading-none',
                isSelected
                  ? 'font-bold text-brand-700 dark:text-brand-300'
                  : 'text-slate-500',
              )}
            >
              {label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
