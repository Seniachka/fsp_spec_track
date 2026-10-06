export interface Friend {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  educationLevel: 'Бакалавриат' | 'Магистратура' | 'ДПО';
  course: number; // 1-4 для бакалавриата, 1-2 для магистратуры и ДПО
  specialty: string;
  addedDate: Date;
  isFavorite: boolean;
}

// Вспомогательная функция для получения сокращённого названия уровня образования
export const getEducationShortName = (level: string): string => {
  const map: Record<string, string> = {
    'Бакалавриат': 'Бак',
    'Магистратура': 'Маг',
    'ДПО': 'ДПО'
  };
  return map[level] || level;
};

export const mockFriends: Friend[] = [
  {
    id: '1',
    firstName: 'Константина',
    lastName: 'Константинопольская',
    educationLevel: 'Бакалавриат',
    course: 3,
    specialty: 'Продакт-менеджмент',
    addedDate: new Date(),
    isFavorite: true,
  },
  {
    id: '2',
    firstName: 'Алексей',
    lastName: 'Смирнов',
    educationLevel: 'Магистратура',
    course: 2,
    specialty: 'ML разработка',
    addedDate: new Date(Date.now() - 86400000),
    isFavorite: false,
  },
  {
    id: '3',
    firstName: 'Евгения',
    lastName: 'Аргентинопольская',
    educationLevel: 'Бакалавриат',
    course: 2,
    specialty: 'Математика',
    addedDate: new Date(Date.now() - 86400000 * 2),
    isFavorite: true,
  },
  {
    id: '4',
    firstName: 'Елена',
    lastName: 'Кузнецова',
    educationLevel: 'Бакалавриат',
    course: 3,
    specialty: 'Маркетинг',
    addedDate: new Date(Date.now() - 86400000 * 5),
    isFavorite: false,
  },
  {
    id: '5',
    firstName: 'Ангелина',
    lastName: 'Мекрюкова',
    educationLevel: 'Магистратура',
    course: 1,
    specialty: 'Школа дизайна',
    addedDate: new Date(Date.now() - 86400000 * 30),
    isFavorite: false,
  },
  {
    id: '6',
    firstName: 'Александра',
    lastName: 'Петухова',
    educationLevel: 'Бакалавриат',
    course: 4,
    specialty: 'Аналитика данных',
    addedDate: new Date(Date.now() - 86400000 * 60),
    isFavorite: false,
  },
  {
    id: '7',
    firstName: 'Дмитрий',
    lastName: 'Иванов',
    educationLevel: 'ДПО',
    course: 2,
    specialty: 'Системный анализ',
    addedDate: new Date(Date.now() - 86400000 * 90),
    isFavorite: false,
  },
];