import type { FriendItem } from '../model/types'

const MONTH_NAMES = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
]

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

/** Понедельник текущей недели */
const startOfWeekMonday = (today: Date) => {
  const day = (today.getDay() + 6) % 7
  const start = new Date(today)
  start.setDate(today.getDate() - day)
  return start
}

export type FriendGroup = {
  title: string
  items: FriendItem[]
}

/**
 * Группировка вкладки «Мои» по дате добавления.
 * Контакты без даты — в «Ранее», чтобы заголовок всегда был.
 */
export const groupFriends = (friends: FriendItem[]): FriendGroup[] => {
  const today = startOfDay(new Date())
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const weekStart = startOfWeekMonday(today)
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

  const todayItems: FriendItem[] = []
  const yesterdayItems: FriendItem[] = []
  const thisWeekItems: FriendItem[] = []
  const thisMonthItems: FriendItem[] = []
  const earlierItems: FriendItem[] = []
  const otherMonths: { month: number; year: number; items: FriendItem[] }[] = []

  friends.forEach((friend) => {
    if (!friend.addedDate) {
      earlierItems.push(friend)
      return
    }

    const date = new Date(friend.addedDate)
    if (Number.isNaN(date.getTime())) {
      earlierItems.push(friend)
      return
    }

    const dateDay = startOfDay(date)

    if (dateDay.getTime() === today.getTime()) {
      todayItems.push(friend)
    } else if (dateDay.getTime() === yesterday.getTime()) {
      yesterdayItems.push(friend)
    } else if (dateDay >= weekStart && dateDay < today) {
      thisWeekItems.push(friend)
    } else if (dateDay >= monthStart && dateDay < weekStart) {
      thisMonthItems.push(friend)
    } else {
      const monthKey = date.getMonth()
      const yearKey = date.getFullYear()
      let found = otherMonths.find((m) => m.month === monthKey && m.year === yearKey)
      if (!found) {
        found = { month: monthKey, year: yearKey, items: [] }
        otherMonths.push(found)
      }
      found.items.push(friend)
    }
  })

  otherMonths.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year
    return b.month - a.month
  })

  const groups: FriendGroup[] = []
  const addGroup = (title: string, items: FriendItem[]) => {
    if (items.length > 0) groups.push({ title, items })
  }

  addGroup('Сегодня', todayItems)
  addGroup('Вчера', yesterdayItems)
  addGroup('На этой неделе', thisWeekItems)
  addGroup(MONTH_NAMES[today.getMonth()], thisMonthItems)

  otherMonths.forEach(({ month, year, items }) => {
    const title =
      MONTH_NAMES[month] + (year === today.getFullYear() ? '' : ` ${year}`)
    addGroup(title, items)
  })

  addGroup('Ранее', earlierItems)

  return groups
}
