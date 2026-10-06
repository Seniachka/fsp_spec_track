import { useLocation } from 'react-router-dom'
import { FiltersPage } from './FiltersPage'
import { SwipeKeepAliveLayout } from '../../../shared/ui/swipe-keep-alive/SwipeKeepAliveLayout'

const isSkillsOverlay = (pathname: string): boolean =>
  pathname.startsWith('/search/filters/hard-skills') ||
  pathname.startsWith('/search/filters/soft-skills')

/** Фильтры остаются под выбором скиллов. */
export const FiltersKeepAliveLayout = () => {
  const { pathname } = useLocation()
  return (
    <SwipeKeepAliveLayout
      base={<FiltersPage />}
      hasOverlay={isSkillsOverlay(pathname)}
      stack
    />
  )
}
