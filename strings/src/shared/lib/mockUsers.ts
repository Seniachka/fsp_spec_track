export interface User {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  specialty: string;
  workPlace?: string;
  status: string;
  hardSkills: string[];
  softSkills: string[];
  faculty?: string;
  degree?: string;
  course?: number;
  educationLevel?: string;
  graduationYear?: number;
}

export const userStatuses = [
  'Ищет проект',
  'Собирает команду',
  'Хочет нетворк',
  'Работает',
  'Устал',
  'Не беспокоить',
] as const;

export const degreeOptions = ['Бакалавриат', 'Магистратура', 'ДПО'] as const;

// Курсы в зависимости от степени
export const getCoursesByDegree = (degree: string) => {
  switch (degree) {
    case 'Бакалавриат':
      return [1, 2, 3, 4];
    case 'Магистратура':
      return [1, 2];
    case 'ДПО':
      return [1, 2];
    default:
      return [];
  }
};

export const allHardSkills = [
  'Вайбкодинг', 'C#', 'C++', 'Python', 'Go', 'React', 'JavaScript', 'Java',
  'TypeScript', 'Docker', 'Kubernetes', 'SQL', 'Figma', 'UI/UX', 'Product Management',
];

export const allSoftSkills = [
  'Коммуникабельность', 'Командная работа', 'Креативность', 'Адаптивность',
  'Лидерство', 'Эмпатия', 'Тайм-менеджмент', 'Критическое мышление',
];

export const mockUsers: User[] = [
  {
    id: '1',
    firstName: 'Алексей',
    lastName: 'Иванов',
    avatarUrl: '',
    specialty: 'Product Design',
    workPlace: 'T-Банк',
    status: 'Собирает команду',
    hardSkills: ['Python', 'React', 'Docker'],
    softSkills: ['Коммуникабельность', 'Командная работа'],
    faculty: 'Компьютерные науки',
    degree: 'Бакалавриат',
    course: 3,
    educationLevel: 'Бакалавр',
    graduationYear: 2026,
  },
  {
    id: '2',
    firstName: 'Мария',
    lastName: 'Петрова',
    avatarUrl: '',
    specialty: 'Fullstack Developer',
    workPlace: 'Яндекс',
    status: 'Ищет проект',
    hardSkills: ['JavaScript', 'TypeScript', 'SQL'],
    softSkills: ['Лидерство', 'Критическое мышление'],
    faculty: 'Математика',
    degree: 'Магистратура',
    course: 2,
    educationLevel: 'Магистр',
    graduationYear: 2025,
  },
  {
    id: '3',
    firstName: 'Дмитрий',
    lastName: 'Смирнов',
    avatarUrl: '',
    specialty: 'Backend Developer',
    workPlace: 'Google',
    status: 'Ищет проект',
    hardSkills: ['Go', 'Kubernetes', 'Docker'],
    softSkills: ['Адаптивность', 'Командная работа'],
    faculty: 'Компьютерные науки',
    degree: 'Бакалавриат',
    course: 4,
    educationLevel: 'Бакалавр',
    graduationYear: 2026,
  },
  {
    id: '4',
    firstName: 'Екатерина',
    lastName: 'Кузнецова',
    avatarUrl: '',
    specialty: 'Frontend Developer',
    workPlace: 'Microsoft',
    status: 'Хочет нетворк',
    hardSkills: ['React', 'JavaScript', 'UI/UX'],
    softSkills: ['Креативность', 'Эмпатия'],
    faculty: 'Дизайн',
    degree: 'ДПО',
    course: 1,
    educationLevel: 'Специалист',
    graduationYear: 2024,
  },
  {
    id: '5',
    firstName: 'Сергей',
    lastName: 'Морозов',
    avatarUrl: '',
    specialty: 'Data Scientist',
    workPlace: 'Amazon',
    status: 'Ищет проект',
    hardSkills: ['Python', 'SQL', 'Java'],
    softSkills: ['Критическое мышление', 'Тайм-менеджмент'],
    faculty: 'Математика',
    degree: 'Бакалавриат',
    course: 2,
    educationLevel: 'Бакалавр',
    graduationYear: 2027,
  },
  {
    id: '6',
    firstName: 'Анна',
    lastName: 'Новикова',
    avatarUrl: '',
    specialty: 'Product Manager',
    workPlace: 'T-Банк',
    status: 'Собирает команду',
    hardSkills: ['Product Management', 'Figma', 'UI/UX'],
    softSkills: ['Лидерство', 'Коммуникабельность'],
    faculty: 'Менеджмент',
    degree: 'Магистратура',
    course: 1,
    educationLevel: 'Магистр',
    graduationYear: 2026,
  },
  {
    id: '7',
    firstName: 'Игорь',
    lastName: 'Васильев',
    avatarUrl: '',
    specialty: 'DevOps Engineer',
    workPlace: 'Яндекс',
    status: 'Не беспокоить',
    hardSkills: ['Docker', 'Kubernetes', 'Go'],
    softSkills: ['Адаптивность', 'Критическое мышление'],
    faculty: 'Компьютерные науки',
    degree: 'Бакалавриат',
    course: 4,
    educationLevel: 'Бакалавр',
    graduationYear: 2026,
  },
  {
    id: '8',
    firstName: 'Ольга',
    lastName: 'Павлова',
    avatarUrl: '',
    specialty: 'Mobile Developer',
    workPlace: 'Google',
    status: 'Ищет стартап',
    hardSkills: ['Java', 'C++', 'React'],
    softSkills: ['Командная работа', 'Эмпатия'],
    faculty: 'Инженерия',
    degree: 'ДПО',
    course: 2,
    educationLevel: 'Специалист',
    graduationYear: 2025,
  },
  {
    id: '9',
    firstName: 'Андрей',
    lastName: 'Соколов',
    avatarUrl: '',
    specialty: 'System Architect',
    workPlace: 'Microsoft',
    status: 'За нетворкинг',
    hardSkills: ['C#', 'SQL', 'TypeScript'],
    softSkills: ['Лидерство', 'Тайм-менеджмент'],
    faculty: 'Компьютерные науки',
    degree: 'Магистратура',
    course: 2,
    educationLevel: 'Магистр',
    graduationYear: 2025,
  },
];