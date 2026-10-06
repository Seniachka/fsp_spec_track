import {
  buildCampusSearch,
  campusFloorHasHits,
  campusMarkerTitle,
  checkCampusAliasLinks,
  isCampusCodeQuery,
  matchesCampusRoom,
  normalizeCampusQuery,
  resolveRoomMarkers,
  zoneTitle,
} from './campusSearch'
import { DUKAT_CAMPUS } from './campuses/dukat'
import { TELEGRAPH_CAMPUS } from './campuses/telegraph'
import type { Campus, CampusId, CampusMarkerKind } from './types'

export {
  buildCampusSearch,
  campusFloorHasHits,
  campusMarkerTitle,
  isCampusCodeQuery,
  matchesCampusRoom,
  normalizeCampusQuery,
  resolveRoomMarkers,
  zoneTitle,
}
export { DUKAT_CAMPUS, TELEGRAPH_CAMPUS }
export type {
  Campus,
  CampusCategorySynonym,
  CampusFloor,
  CampusFloorResult,
  CampusId,
  CampusMarker,
  CampusMarkerKind,
  CampusResultRow,
  CampusRoom,
  CampusSearch,
  CampusSearchAlias,
  CampusZone,
} from './types'

/** Кампусы в порядке показа в переключателе; первый — тот, что открывается по умолчанию */
export const CAMPUSES: Campus[] = [DUKAT_CAMPUS, TELEGRAPH_CAMPUS]

export const DEFAULT_CAMPUS_ID: CampusId = 'dukat'

export const getCampus = (id: CampusId): Campus =>
  CAMPUSES.find((campus) => campus.id === id) ?? CAMPUSES[0]

/** Цвета плашек с легенды плана — общие для всех кампусов */
const CAMPUS_KIND_COLORS: Record<CampusMarkerKind, string> = {
  students: '#101828',
  food: '#12B76A',
  teachers: '#7057F8',
  fitness: '#EE46BC',
  closed: '#F79009',
  wellbeing: '#B692F6',
}

/** Легенда под планом: цвет и подпись каждого вида помещений кампуса */
export const campusLegend = (campus: Campus): { color: string; label: string }[] =>
  campus.legendKinds.map((kind) => ({
    color: CAMPUS_KIND_COLORS[kind],
    label: campus.kindLabels[kind] ?? kind,
  }))

const CAMPUS_STORAGE_KEY = 'campus_map_campus_v1'

const isCampusId = (value: string | null): value is CampusId =>
  CAMPUSES.some((campus) => campus.id === value)

/**
 * Выбранный кампус переживает перезагрузку: чаще всего человек ходит в один и
 * тот же. localStorage бывает недоступен (приватный режим, запрет куки) —
 * тогда просто открываем кампус по умолчанию.
 */
export const readStoredCampusId = (): CampusId => {
  try {
    const stored = localStorage.getItem(CAMPUS_STORAGE_KEY)
    return isCampusId(stored) ? stored : DEFAULT_CAMPUS_ID
  } catch {
    return DEFAULT_CAMPUS_ID
  }
}

export const storeCampusId = (id: CampusId): void => {
  try {
    localStorage.setItem(CAMPUS_STORAGE_KEY, id)
  } catch {
    // запись недоступна — выбор просто не запомнится
  }
}

if (import.meta.env.DEV) {
  for (const campus of CAMPUSES) checkCampusAliasLinks(campus)
}
