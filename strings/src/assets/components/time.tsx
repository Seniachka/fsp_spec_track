import * as React from "react";

/**
 * Прозрачность вынесена на группу, а не на каждый штрих: контуры пузырей
 * стыкуются внахлёст, и при stroke-opacity на путях в местах стыка
 * получались заметные тёмные точки.
 */
const TimeIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    width={20}
    height={20}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <g opacity={0.85}>
      {/* Передний пузырь: сверху-слева, хвостик вниз-влево */}
      <path
        d="M11.5 7.75a1.5 1.5 0 0 1-1.5 1.5H5.5l-3 3V4a1.5 1.5 0 0 1 1.5-1.5H10a1.5 1.5 0 0 1 1.5 1.5v3.75Z"
        stroke="currentColor"
        strokeWidth={1.875}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Задний пузырь: смещён вниз-вправо, хвостик вниз-вправо. Рисуем только
          видимую часть контура, а концы заводим под штрих переднего пузыря
          (x 12.5 и y 10.25), иначе линии повисают в воздухе и фигуры читаются
          как два отдельных пузыря, а не как перекрывающиеся. */}
      <path
        d="M12.5 7.75H16a1.5 1.5 0 0 1 1.5 1.5v8.25l-3-3H10a1.5 1.5 0 0 1-1.5-1.5v-2.75"
        stroke="currentColor"
        strokeWidth={1.875}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  </svg>
);

export default TimeIcon;
