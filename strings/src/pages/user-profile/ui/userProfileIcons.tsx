type IconProps = { className?: string; filled?: boolean }

/** Фиолетовый акцент приложения — тот же, что --color-brand в typography.css */
const BRAND_PURPLE = '#7057F8'

export const HeartIcon = ({ className, filled }: IconProps) => (
  <svg
    className={className}
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill={filled ? '#E9103C' : 'none'}
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M15.7 4C18.87 4 21 6.98 21 9.76C21 15.39 12.16 20 12 20C11.84 20 3 15.39 3 9.76C3 6.98 5.13 4 8.3 4C10.12 4 11.31 4.91 12 5.71C12.69 4.91 13.88 4 15.7 4Z"
      stroke={filled ? '#E9103C' : 'black'}
      strokeOpacity={filled ? 1 : 0.85}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export const LinkIcon = ({ className }: IconProps) => (
  <svg
    className={className}
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden
  >
    <path
      d="M15.9636 6.03599C17.3446 4.65499 19.5826 4.65499 20.9636 6.03599V6.03599C22.3446 7.41699 22.3446 9.65499 20.9636 11.036L15.0846 16.915C13.7036 18.296 11.4656 18.296 10.0846 16.915V16.915C8.70358 15.534 8.70358 13.296 10.0846 11.915L10.9636 11.036"
      stroke="black"
      strokeOpacity="0.85"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M8.03575 18.964C6.65475 20.345 4.41675 20.345 3.03575 18.964V18.964C1.65475 17.583 1.65475 15.345 3.03575 13.964L8.91475 8.08501C10.2958 6.70401 12.5338 6.70401 13.9148 8.08501V8.08501C15.2958 9.46601 15.2958 11.704 13.9148 13.085L12.9998 14"
      stroke="black"
      strokeOpacity="0.85"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

/** filled — у текущего пользователя есть заметка про этого человека */
export const NotesIcon = ({ className, filled }: IconProps) => {
  // Залитый вариант: корпус блокнота фиолетовый, строки внутри — белые
  const outline = filled ? BRAND_PURPLE : 'black'
  const outlineOpacity = filled ? 1 : 0.85
  const lines = filled ? '#FFFFFF' : 'black'

  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M18.0019 21.0037H5.99693C4.89147 21.0037 3.99609 20.1083 3.99609 19.0029V4.99705C3.99609 3.89159 4.89147 2.99622 5.99693 2.99622H18.0019C19.1074 2.99622 20.0028 3.89159 20.0028 4.99705V19.0029C20.0028 20.1083 19.1074 21.0037 18.0019 21.0037Z"
        fill={filled ? BRAND_PURPLE : 'none'}
        stroke={outline}
        strokeOpacity={outlineOpacity}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.99805 7.99832H16.001"
        stroke={lines}
        strokeOpacity={outlineOpacity}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.99805 16.0016H16.001"
        stroke={lines}
        strokeOpacity={outlineOpacity}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.99805 12H16.001"
        stroke={lines}
        strokeOpacity={outlineOpacity}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.49609 7.99832H5.49734"
        stroke={outline}
        strokeOpacity={outlineOpacity}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.49609 16.0016H5.29826"
        stroke={outline}
        strokeOpacity={outlineOpacity}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.49609 12H5.29826"
        stroke={outline}
        strokeOpacity={outlineOpacity}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export const ContactBadgeIcon = ({ className }: IconProps) => (
  <svg
    className={className}
    width="27"
    height="27"
    viewBox="0 0 27 27"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden
  >
    <ellipse
      cx="18.4812"
      cy="7.14147"
      rx="2.16013"
      ry="2.08226"
      transform="rotate(6.70354 18.4812 7.14147)"
      stroke="white"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <ellipse
      cx="5.67652"
      cy="12.4208"
      rx="2.16013"
      ry="2.08226"
      transform="rotate(6.70354 5.67652 12.4208)"
      stroke="white"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <ellipse
      cx="16.9148"
      cy="20.5223"
      rx="2.16013"
      ry="2.08226"
      transform="rotate(6.70354 16.9148 20.5223)"
      stroke="white"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M16.5961 6.13279C15.3128 5.64249 13.9284 5.47602 12.5655 5.6481"
      stroke="white"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M20.0203 8.60352C20.8669 9.64124 21.4289 10.8814 21.6511 12.2021"
      stroke="white"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M5.72735 14.4941C5.9419 15.8159 6.49676 17.059 7.33736 18.1013"
      stroke="white"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M6.20609 10.4153C6.72125 9.17935 7.54923 8.09874 8.60861 7.27975"
      stroke="white"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M18.7503 19.4562C19.8144 18.643 20.6486 17.567 21.1709 16.3338"
      stroke="white"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M14.8468 21.0654C13.4847 21.2448 12.0994 21.0857 10.8135 20.6023"
      stroke="white"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export const ReportIcon = ({ className }: IconProps) => (
  <svg
    className={className}
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 3V3C16.971 3 21 7.029 21 12V12C21 16.971 16.971 21 12 21V21C7.029 21 3 16.971 3 12V12C3 7.029 7.029 3 12 3Z"
      stroke="black"
      strokeOpacity="0.85"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M12 12.5V7.5"
      stroke="black"
      strokeOpacity="0.85"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M11.999 16C11.861 16 11.749 16.112 11.75 16.25C11.75 16.388 11.862 16.5 12 16.5C12.138 16.5 12.25 16.388 12.25 16.25C12.25 16.112 12.138 16 11.999 16"
      stroke="black"
      strokeOpacity="0.85"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)
