import type { ComponentType, SVGProps } from 'react'
import {
  StatusBriefcaseIcon,
  StatusDndIcon,
  StatusEyeIcon,
  StatusNetworkIcon,
  StatusRocketIcon,
  StatusVacationIcon,
} from '../../../assets/components/statusIcons'
import { getStatusIdByLabel } from './types'

export type StatusVisual = {
  id: number
  label: string
  color: string
  Icon: ComponentType<SVGProps<SVGSVGElement>>
}

export const STATUS_VISUALS: StatusVisual[] = [
  { id: 1, label: 'Ищу проект', color: '#3E9BFFD9', Icon: StatusRocketIcon },
  { id: 2, label: 'Собираю команду', color: '#3254DBD9', Icon: StatusEyeIcon },
  { id: 3, label: 'Хочу нетворкинг', color: '#24B568D9', Icon: StatusNetworkIcon },
  { id: 4, label: 'Работаю', color: '#EB6531D9', Icon: StatusBriefcaseIcon },
  { id: 5, label: 'Хочу на отдых', color: '#FF51AED9', Icon: StatusVacationIcon },
  { id: 6, label: 'Не беспокоить', color: '#DB325CD9', Icon: StatusDndIcon },
]

export const getStatusVisual = (params: {
  statusId?: number | null
  label?: string | null
}): StatusVisual | null => {
  if (params.statusId != null) {
    const byId = STATUS_VISUALS.find((s) => s.id === params.statusId)
    if (byId) return byId
  }
  const label = params.label?.trim()
  if (!label) return null
  const id = getStatusIdByLabel(label)
  if (id != null) {
    const byId = STATUS_VISUALS.find((s) => s.id === id)
    if (byId) return byId
  }
  const byLabel = STATUS_VISUALS.find((s) => s.label.toLowerCase() === label.toLowerCase())
  return byLabel ?? null
}
