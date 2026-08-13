import type { TuiPluginApi } from '@opencode-ai/plugin/tui'
import { createSignal, type Signal } from 'solid-js'
import { deriveDashboardSnapshot, TUI_REFRESH_EVENT_NAMES } from './index.js'
import type { TuiDashboardSnapshot } from './types.js'

type SnapshotSignal = Signal<TuiDashboardSnapshot | undefined>
type SnapshotStore = Readonly<{ snapshot: (sessionId: string) => SnapshotSignal[0]; dispose: () => void }>
const stores = new WeakMap<TuiPluginApi, SnapshotStore>()

export const createSnapshotStore = (api: TuiPluginApi): SnapshotStore => {
  const shared = stores.get(api)
  if (shared) {
    return shared
  }
  const snapshots = new Map<string, SnapshotSignal>()
  const refresh = () => {
    for (const [sessionId, [, setSnapshot]] of snapshots) {
      setSnapshot(deriveDashboardSnapshot(api, sessionId))
    }
  }
  const unsubscribe = TUI_REFRESH_EVENT_NAMES.map((name) => api.event.on(name, refresh))

  const snapshot = (sessionId: string) => {
    const existing = snapshots.get(sessionId)
    if (existing) {
      return existing[0]
    }
    const signal = createSignal<TuiDashboardSnapshot | undefined>(
      deriveDashboardSnapshot(api, sessionId),
    ) as SnapshotSignal
    snapshots.set(sessionId, signal)
    return signal[0]
  }

  const dispose = () => {
    if (stores.get(api) !== store) {
      return
    }
    for (const unsubscribeEvent of unsubscribe) {
      unsubscribeEvent()
    }
    snapshots.clear()
    stores.delete(api)
  }
  const store: SnapshotStore = { snapshot, dispose }
  stores.set(api, store)
  return store
}
