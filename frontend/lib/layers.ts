export interface LayerGroup {
  id: string
  label: string
  section: 'transit' | 'poi'
  classes: string[]
}

export const LAYER_GROUPS: LayerGroup[] = [
  { id: 'bus',      label: 'Bus stops',          section: 'transit', classes: ['bus'] },
  { id: 'rail',     label: 'Rail & Tube',         section: 'transit', classes: ['rail'] },
  { id: 'airport',  label: 'Airports',            section: 'transit', classes: ['airport'] },
  { id: 'education',label: 'Schools & Colleges',  section: 'poi',     classes: ['school', 'college', 'university', 'kindergarten'] },
  { id: 'health',   label: 'Healthcare',          section: 'poi',     classes: ['hospital', 'pharmacy', 'dentist', 'clinic', 'doctors'] },
  { id: 'food',     label: 'Food & Drink',        section: 'poi',     classes: ['restaurant', 'cafe', 'fast_food', 'bar', 'pub', 'biergarten', 'ice_cream'] },
  { id: 'shopping', label: 'Shopping',            section: 'poi',     classes: ['shop', 'supermarket', 'convenience', 'department_store', 'clothes', 'mall'] },
  { id: 'worship',  label: 'Places of Worship',   section: 'poi',     classes: ['place_of_worship'] },
]

export type LayerEnabled = Record<string, boolean>

export const DEFAULT_LAYER_ENABLED: LayerEnabled = Object.fromEntries(
  LAYER_GROUPS.map(g => [g.id, true])
)
