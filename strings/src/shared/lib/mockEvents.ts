export interface Event {
  id: string;
  title: string;
  description: string;
  dateStart: string;
  dateEnd: string;
  location: string;
  registrationLink: string;
  format: 'online' | 'offline' | 'hybrid';
  tags: string[];
  image: string;
  attendees: number;
  isAttending?: boolean;
}

export const mockEvents: Event[] = [
  {
    id: '1',
    title: 'Хакатон по AI и машинному обучению',
    description: 'Соревнование для разработчиков, data scientists и энтузиастов. Создайте решение для реальной бизнес-задачи за 48 часов.',
    dateStart: '2026-09-15T10:00:00Z',
    dateEnd: '2026-09-17T18:00:00Z',
    location: 'Москва, ул. Ленина 1, коворкинг «Старт»',
    registrationLink: 'https://example.com/hackathon-ai',
    format: 'offline',
    tags: ['AI', 'хакатон', 'Python', 'ML', 'команда'],
    image: 'https://picsum.photos/seed/event1/600/400',
    attendees: 45,
    isAttending: false,
  },
  {
    id: '2',
    title: 'Вебинар «Как запустить стартап за 30 дней»',
    description: 'Практический вебинар от основателя успешного стартапа. Разберём этапы, ошибки и инструменты.',
    dateStart: '2026-08-20T14:00:00Z',
    dateEnd: '2026-08-20T16:00:00Z',
    location: 'Online (Zoom)',
    registrationLink: 'https://example.com/webinar-startup',
    format: 'online',
    tags: ['стартап', 'бизнес', 'онлайн'],
    image: 'https://picsum.photos/seed/event2/600/400',
    attendees: 120,
    isAttending: true,
  },
  {
    id: '3',
    title: 'Кампус на майских каникулах',
    description: 'Интенсив по дизайн-мышлению для продуктовых дизайнеров и менеджеров. За 5 дней создадим прототип.',
    dateStart: '2026-09-01T09:00:00Z',
    dateEnd: '2026-09-05T18:00:00Z',
    location: 'Центральный университет',
    registrationLink: 'https://example.com/campus-on-may-vacation',
    format: 'offline',
    tags: ['встреча', 'нетворкинг', 'клубы', 'тимбилдинг'],
    image: 'https://picsum.photos/seed/event3/600/400',
    attendees: 25,
    isAttending: false,
  },
  {
    id: '4',
    title: 'Встреча выпускников факультета дизайна',
    description: 'Неформальная встреча, обмен опытом, поиск партнёров и просто приятное общение.',
    dateStart: '2026-08-25T19:00:00Z',
    dateEnd: '2026-08-25T22:00:00Z',
    location: 'Москва, антикафе «Территория»',
    registrationLink: 'https://example.com/design-meetup',
    format: 'hybrid',
    tags: ['нетворкинг', 'дизайн', 'выпускники'],
    image: 'https://picsum.photos/seed/event4/600/400',
    attendees: 30,
    isAttending: false,
  },
  {
    id: '5',
    title: 'Курс по React Native для начинающих',
    description: 'Пятидневный онлайн-курс с практическими заданиями и обратной связью.',
    dateStart: '2026-08-01T11:00:00Z',
    dateEnd: '2026-09-14T15:00:00Z',
    location: 'Online (платформа EdTech)',
    registrationLink: 'https://example.com/react-native-course',
    format: 'online',
    tags: ['React Native', 'мобильная разработка', 'обучение'],
    image: 'https://picsum.photos/seed/event5/600/400',
    attendees: 80,
    isAttending: false,
  },
];

const EVENTS_STORAGE_KEY = 'attending_events';

export const loadAttendingEvents = (): string[] => {
  try {
    const data = localStorage.getItem(EVENTS_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

export const saveAttendingEvents = (ids: string[]) => {
  localStorage.setItem(EVENTS_STORAGE_KEY, JSON.stringify(ids));
};

export const toggleAttendingEvent = (eventId: string, current: boolean): string[] => {
  const ids = loadAttendingEvents();
  if (current) {
    // если уже идёт, убираем
    return ids.filter(id => id !== eventId);
  } else {
    // если не идёт, добавляем
    if (!ids.includes(eventId)) {
      return [...ids, eventId];
    }
    return ids;
  }
};