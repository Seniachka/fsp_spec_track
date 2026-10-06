export interface Announcement {
  id: string;
  title: string;
  description: string;
  author: {
    id: string;
    name: string;
    avatar: string;
  };
  createdAt: string;
  isOwn?: boolean;        // добавлено
  isResponded?: boolean;  // добавлено
}

export const mockAnnouncements: Announcement[] = [
  {
    id: 'a1',
    title: 'Ищем дизайнера в проект',
    description: 'Нужен UI/UX дизайнер для стартапа в сфере edtech. Удаленно, гибкий график. Опыт от 1 года.',
    author: {
      id: 'user1',
      name: 'Анна Смирнова',
      avatar: 'https://picsum.photos/seed/anna/100/100',
    },
    createdAt: '2026-08-01T12:00:00Z',
  },
  {
    id: 'a2',
    title: 'Помощь в организации хакатона',
    description: 'Нужны волонтёры для проведения хакатона 15-17 сентября. Помощь в регистрации, координации, призах.',
    author: {
      id: 'user2',
      name: 'Дмитрий Петров',
      avatar: 'https://picsum.photos/seed/dmitry/100/100',
    },
    createdAt: '2026-08-02T10:30:00Z',
  },
  {
    id: 'a3',
    title: 'Продаю учебники по экономике',
    description: 'Комплект учебников для бакалавриата. Состояние отличное. Цена договорная.',
    author: {
      id: 'user3',
      name: 'Елена Васильева',
      avatar: 'https://picsum.photos/seed/elena/100/100',
    },
    createdAt: '2026-08-03T16:20:00Z',
  },
];

// Мок откликов на свои объявления (для демонстрации)
export const mockResponses: Record<string, { id: string; name: string; avatar: string }[]> = {
  'my1': [
    { id: 'u1', name: 'Анна Смирнова', avatar: 'https://picsum.photos/seed/anna/100/100' },
    { id: 'u2', name: 'Дмитрий Петров', avatar: 'https://picsum.photos/seed/dmitry/100/100' },
    { id: 'u3', name: 'Елена Васильева', avatar: 'https://picsum.photos/seed/elena/100/100' },
  ],
  'my2': [
    { id: 'u4', name: 'Иван Иванов', avatar: 'https://picsum.photos/seed/ivan/100/100' },
  ],
};

// Сохранение в localStorage
const STORAGE_KEY = 'announcements';
const RESPONSES_KEY = 'my_responses';

export const loadAnnouncements = (): Announcement[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      return parsed.map((a: Announcement) => ({
        ...a,
        isOwn: a.author.id === 'me',
      }));
    }
  } catch (_) {}
  // Если ничего нет, создаём начальные свои объявления
  const initial: Announcement[] = [
    {
      id: 'my1',
      title: 'Ищем дизайнера в проект',
      description: 'Нужен UI/UX дизайнер для стартапа в сфере edtech. Удаленно, гибкий график. Опыт от 1 года.',
      author: {
        id: 'me',
        name: 'Вы',
        avatar: 'https://picsum.photos/seed/me/100/100',
      },
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      isOwn: true,
    },
    {
      id: 'my2',
      title: 'Помощь в организации хакатона',
      description: 'Нужны волонтёры для проведения хакатона 15-17 сентября. Помощь в регистрации, координации, призах.',
      author: {
        id: 'me',
        name: 'Вы',
        avatar: 'https://picsum.photos/seed/me/100/100',
      },
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      isOwn: true,
    },
  ];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
  return initial;
};

export const saveAnnouncements = (items: Announcement[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
};

export const loadMyResponses = (): string[] => {
  try {
    const data = localStorage.getItem(RESPONSES_KEY);
    return data ? JSON.parse(data) : [];
  } catch (_) {
    return [];
  }
};

export const saveMyResponses = (ids: string[]) => {
  localStorage.setItem(RESPONSES_KEY, JSON.stringify(ids));
};