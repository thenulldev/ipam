import { create } from 'zustand'
import type {
  CableId,
  DeviceId,
  FloorplanId,
  PortId,
  RackId,
} from '@/lib/types'

export type EditorTool = 'select' | 'pan' | 'place-rack' | 'connect'

interface EditorState {
  selectedFloorplanId: FloorplanId | null
  selectedRackId: RackId | null
  selectedDeviceId: DeviceId | null
  selectedPortId: PortId | null

  /** Port whose connection is currently highlighted. */
  highlightedPortId: PortId | null
  /** Cable currently highlighted. */
  highlightedCableId: CableId | null

  tool: EditorTool
  setTool: (tool: EditorTool) => void

  /** Click-to-connect workflow: first port chosen, awaiting second. */
  connectMode: boolean
  connectFromPortId: PortId | null
  enterConnectMode: () => void
  exitConnectMode: () => void
  setConnectFrom: (id: PortId | null) => void

  selectFloorplan: (id: FloorplanId | null) => void
  selectRack: (id: RackId | null) => void
  selectDevice: (id: DeviceId | null) => void
  selectPort: (id: PortId | null) => void
  highlightPort: (id: PortId | null) => void
  highlightConnection: (portId: PortId | null, cableId: CableId | null) => void
  clear: () => void
}

export const useEditorStore = create<EditorState>((set) => ({
  selectedFloorplanId: null,
  selectedRackId: null,
  selectedDeviceId: null,
  selectedPortId: null,
  highlightedPortId: null,
  highlightedCableId: null,
  tool: 'select',
  connectMode: false,
  connectFromPortId: null,
  setTool: (tool) => set({ tool }),
  enterConnectMode: () => set({ connectMode: true, connectFromPortId: null }),
  exitConnectMode: () => set({ connectMode: false, connectFromPortId: null }),
  setConnectFrom: (connectFromPortId) => set({ connectFromPortId }),
  selectFloorplan: (selectedFloorplanId) =>
    set({ selectedFloorplanId, selectedDeviceId: null, selectedPortId: null }),
  selectRack: (selectedRackId) =>
    set({ selectedRackId, selectedDeviceId: null, selectedPortId: null }),
  selectDevice: (selectedDeviceId) =>
    set({ selectedDeviceId, selectedPortId: null }),
  selectPort: (selectedPortId) => set({ selectedPortId }),
  highlightPort: (highlightedPortId) =>
    set({ highlightedPortId, highlightedCableId: null }),
  highlightConnection: (highlightedPortId, highlightedCableId) =>
    set({ highlightedPortId, highlightedCableId }),
  clear: () =>
    set({
      selectedFloorplanId: null,
      selectedRackId: null,
      selectedDeviceId: null,
      selectedPortId: null,
      highlightedPortId: null,
      highlightedCableId: null,
      tool: 'select',
      connectMode: false,
      connectFromPortId: null,
    }),
}))
