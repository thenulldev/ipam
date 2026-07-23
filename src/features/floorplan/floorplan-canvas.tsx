import type Konva from 'konva'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Circle,
  Image as KonvaImage,
  Layer,
  Line,
  Rect,
  Stage,
  Text,
} from 'react-konva'
import type {
  Cable,
  CableKind,
  Device,
  Floorplan,
  Port,
  Rack,
  RackId,
} from '@/lib/types'
import { useUpdateRackPosition, useUsers } from '@/lib/queries'
import { useTenantStore } from '@/store/tenant-store'
import { canWrite } from '@/lib/auth'

interface FloorplanCanvasProps {
  floorplan: Floorplan
  racks: Rack[]
  rackPositions: Array<{ rack: Rack; position: Floorplan['rackPositions'][number] }>
  devices: Device[]
  ports: Port[]
  cables?: Cable[]
  onSelectRack?: (rackId: RackId) => void
  selectedRackId?: RackId | null
}

const RACK_W = 80
const RACK_H_PAD = 60

const cableColor: Record<CableKind, string> = {
  cat5e: '#94a3b8',
  cat6: '#64748b',
  cat6a: '#475569',
  'fiber-sm-os2': '#06b6d4',
  'fiber-mm-om3': '#22d3ee',
  dac: '#f59e0b',
  'power-c13': '#f43f5e',
  'power-c19': '#e11d48',
  'console-usb': '#6366f1',
}

function portFloorplanPos(
  device: Device,
  rack: Rack,
  rackPos: { x: number; y: number; rotation?: number },
): { x: number; y: number } {
  const yRel =
    (rack.uHeight - device.uStart + 0.5) / rack.uHeight * RACK_H_PAD
  const xOffset = device.face === 'front' ? RACK_W * 0.25 : RACK_W * 0.75
  return { x: rackPos.x + xOffset, y: rackPos.y + yRel }
}

function useFloorplanImage(url: string | undefined) {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  useEffect(() => {
    if (!url) {
      setImage(null)
      return
    }
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => setImage(img)
    img.src = url
  }, [url])
  return image
}

export function FloorplanCanvas({
  floorplan,
  racks,
  rackPositions,
  devices,
  ports,
  cables = [],
  onSelectRack,
  selectedRackId,
}: FloorplanCanvasProps) {
  const stageRef = useRef<Konva.Stage>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [scale, setScale] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [dragOver, setDragOver] = useState(false)

  const tenantId = useTenantStore((s) => s.currentTenantId)
  const currentUserId = useTenantStore((s) => s.currentUserId)
  const tenantUsers = useUsers(tenantId).data ?? []
  const currentUser = tenantUsers.find((u) => u.id === currentUserId)
  const role = currentUser?.role ?? 'viewer'
  const writable = canWrite(role)
  const actorName = currentUser?.name ?? 'System'

  const updatePosition = useUpdateRackPosition()

  const bgImage = useFloorplanImage(floorplan.imageUrl)

  useEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight })
    })
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const padding = 80
    setPos({
      x: Math.max(40, (size.w - floorplan.width - padding * 2) / 2),
      y: Math.max(40, (size.h - floorplan.height - padding * 2) / 2),
    })
    setScale(1)
  }, [floorplan.id, floorplan.width, floorplan.height, size.w, size.h])

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return
    const scaleBy = 1.08
    const oldScale = scale
    const pointer = stage.getPointerPosition()
    if (!pointer) return
    const mouseTo = {
      x: (pointer.x - pos.x) / oldScale,
      y: (pointer.y - pos.y) / oldScale,
    }
    const direction = e.evt.deltaY > 0 ? -1 : 1
    const newScale = Math.min(4, Math.max(0.2, oldScale * scaleBy ** direction))
    setScale(newScale)
    setPos({
      x: pointer.x - mouseTo.x * newScale,
      y: pointer.y - mouseTo.y * newScale,
    })
  }

  const devicesByRack = new Map<RackId, number>()
  for (const d of devices) {
    devicesByRack.set(d.rackId, (devicesByRack.get(d.rackId) ?? 0) + 1)
  }

  const onDragEnd = (rackId: RackId, x: number, y: number) => {
    if (!writable) return
    x = Math.round(x / 20) * 20
    y = Math.round(y / 20) * 20
    updatePosition.mutate({
      tenantId,
      floorplanId: floorplan.id,
      rackId,
      x,
      y,
      actorId: currentUserId,
      actorName,
    })
  }

  void racks
  void ports
  void devices

  const cableEndpoints = useMemo(() => {
    const devicesById = new Map(devices.map((d) => [d.id, d]))
    const portsById = new Map(ports.map((p) => [p.id, p]))
    const positionsByRackId = new Map(rackPositions.map((p) => [p.rack.id, p.position]))
    const result: Array<{
      cable: Cable
      from: { x: number; y: number }
      to: { x: number; y: number }
      color: string
    }> = []
    for (const cable of cables) {
      const portA = portsById.get(cable.portA)
      const portB = portsById.get(cable.portB)
      if (!portA || !portB) continue
      const deviceA = devicesById.get(portA.deviceId)
      const deviceB = devicesById.get(portB.deviceId)
      if (!deviceA || !deviceB) continue
      const posA = positionsByRackId.get(deviceA.rackId)
      const posB = positionsByRackId.get(deviceB.rackId)
      if (!posA || !posB) continue
      const rackA = rackPositions.find((p) => p.rack.id === deviceA.rackId)?.rack
      const rackB = rackPositions.find((p) => p.rack.id === deviceB.rackId)?.rack
      if (!rackA || !rackB) continue
      result.push({
        cable,
        from: portFloorplanPos(deviceA, rackA, posA),
        to: portFloorplanPos(deviceB, rackB, posB),
        color: cableColor[cable.kind],
      })
    }
    return result
  }, [cables, devices, ports, rackPositions])

  return (
    <div
      ref={containerRef}
      className={`relative h-full min-h-[28rem] w-full touch-none overflow-hidden bg-slate-50 dark:bg-slate-950 ${dragOver ? 'ring-2 ring-brand-500 ring-inset' : ''}`}
    >
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-50" />
      <Stage
        ref={stageRef}
        width={size.w}
        height={size.h}
        scaleX={scale}
        scaleY={scale}
        x={pos.x}
        y={pos.y}
        draggable
        onDragEnd={(e) => {
          if (e.target === stageRef.current) {
            setPos({ x: e.target.x(), y: e.target.y() })
          }
        }}
        onWheel={handleWheel}
        onMouseEnter={() => setDragOver(true)}
        onMouseLeave={() => setDragOver(false)}
      >
        <Layer listening={false}>
          {bgImage ? (
            <KonvaImage
              image={bgImage}
              x={0}
              y={0}
              width={floorplan.width}
              height={floorplan.height}
            />
          ) : (
            <>
              <Rect
                x={0}
                y={0}
                width={floorplan.width}
                height={floorplan.height}
                fill="#f8fafc"
                stroke="#cbd5e1"
                strokeWidth={2}
              />
              {floorplan.width > 100 && floorplan.height > 100 && (
                <Rect
                  x={40}
                  y={40}
                  width={floorplan.width - 80}
                  height={floorplan.height - 80}
                  stroke="#cbd5e1"
                  strokeWidth={1}
                  dash={[6, 6]}
                  cornerRadius={2}
                />
              )}
            </>
          )}
          {Array.from({ length: Math.floor(floorplan.width / 50) + 1 }, (_, i) => (
            <Rect
              key={`gx-${i}`}
              x={i * 50}
              y={0}
              width={1}
              height={floorplan.height}
              fill="#e2e8f0"
            />
          ))}
          {Array.from({ length: Math.floor(floorplan.height / 50) + 1 }, (_, i) => (
            <Rect
              key={`gy-${i}`}
              x={0}
              y={i * 50}
              width={floorplan.width}
              height={1}
              fill="#e2e8f0"
            />
          ))}
        </Layer>
        <Layer>
          {rackPositions.map(({ rack, position }) => {
            const isSelected = selectedRackId === rack.id
            const deviceCount = devicesByRack.get(rack.id) ?? 0
            return (
              <RackMarker
                key={rack.id}
                x={position.x}
                y={position.y}
                rack={rack}
                rotation={position.rotation}
                selected={isSelected}
                deviceCount={deviceCount}
                draggable={writable}
                onSelect={() => onSelectRack?.(rack.id)}
                onDragEnd={(x, y) => onDragEnd(rack.id, x, y)}
              />
            )
          })}
        </Layer>
        <Layer listening={false}>
          {cableEndpoints.map(({ cable, from, to, color }) => (
            <CableLine key={cable.id} from={from} to={to} color={color} />
          ))}
        </Layer>
      </Stage>

      <div className="pointer-events-auto absolute bottom-4 right-4 flex items-center gap-2 rounded-md border border-slate-200 bg-white/80 px-2 py-1 text-xs text-slate-700 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-200">
        <span className="font-mono">{(scale * 100).toFixed(0)}%</span>
        <button
          type="button"
          onClick={() => setScale((s) => Math.min(4, s * 1.2))}
          className="rounded px-1.5 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => setScale((s) => Math.max(0.2, s / 1.2))}
          className="rounded px-1.5 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          −
        </button>
        <button
          type="button"
          onClick={() => {
            setScale(1)
            const padding = 80
            setPos({
              x: Math.max(40, (size.w - floorplan.width - padding * 2) / 2),
              y: Math.max(40, (size.h - floorplan.height - padding * 2) / 2),
            })
          }}
          className="rounded px-1.5 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          reset
        </button>
        {writable && (
          <span className="ml-2 text-slate-500">⇢ drag racks to reposition</span>
        )}
      </div>
    </div>
  )
}

function CableLine({
  from,
  to,
  color,
}: {
  from: { x: number; y: number }
  to: { x: number; y: number }
  color: string
}) {
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  const offset = Math.min(40, len * 0.18)
  const cx = mid.x
  const cy = mid.y - offset
  return (
    <>
      <Line
        points={[from.x, from.y, cx, cy, to.x, to.y]}
        stroke={color}
        strokeWidth={2.5}
        opacity={0.9}
        lineCap="round"
        lineJoin="round"
        pointerLength={8}
        pointerWidth={8}
        pointerAtBeginning={false}
        pointerAtEnding
      />
      <Circle x={from.x} y={from.y} radius={4} fill={color} stroke="white" strokeWidth={1.5} />
      <Circle x={to.x} y={to.y} radius={4} fill={color} stroke="white" strokeWidth={1.5} />
    </>
  )
}

function RackMarker({
  x,
  y,
  rack,
  rotation,
  selected,
  deviceCount,
  draggable,
  onSelect,
  onDragEnd,
}: {
  x: number
  y: number
  rack: Rack
  rotation: 0 | 90 | 180 | 270
  selected: boolean
  deviceCount: number
  draggable: boolean
  onSelect: () => void
  onDragEnd: (x: number, y: number) => void
}) {
  const h = RACK_H_PAD
  const w = RACK_W
  return (
    <>
      <Rect
        x={x}
        y={y}
        width={w}
        height={h}
        rotation={rotation}
        fill={selected ? '#dbeafe' : '#ffffff'}
        stroke={selected ? '#2563eb' : '#cbd5e1'}
        strokeWidth={selected ? 2.5 : 1.5}
        cornerRadius={4}
        shadowColor="#000"
        shadowBlur={selected ? 6 : 0}
        shadowOpacity={0.12}
        draggable={draggable}
        onClick={onSelect}
        onTap={onSelect}
        onDragStart={(e) => {
          e.cancelBubble = true
          e.target.moveToTop()
        }}
        onDragEnd={(e) => {
          e.cancelBubble = true
          onDragEnd(e.target.x(), e.target.y())
        }}
      />
      <Text
        x={x}
        y={y + h / 2 - 10}
        width={w}
        text={rack.name}
        rotation={rotation}
        align="center"
        fontSize={12}
        fontStyle="bold"
        fill={selected ? '#1d4ed8' : '#0f172a'}
        listening={false}
      />
      <Text
        x={x}
        y={y + h / 2 + 6}
        width={w}
        text={`${rack.uHeight}U · ${deviceCount} dev`}
        rotation={rotation}
        align="center"
        fontSize={10}
        fill={selected ? '#1e40af' : '#64748b'}
        listening={false}
      />
    </>
  )
}
