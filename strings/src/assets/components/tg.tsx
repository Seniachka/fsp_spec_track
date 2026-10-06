import * as React from "react";

const TgIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={20}
    height={20}
    fill="none"
    {...props}
  >
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.875}
      d="m9.83 14.089-1.722 1.674a.555.555 0 0 1-.918-.237l-1.147-3.775"
    />
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M11.753 9.106 8.49 12.052a.702.702 0 0 0 .055 1.087l4.482 3.311A.754.754 0 0 0 14.21 16l2.2-10.372a.646.646 0 0 0-.863-.737L2.618 9.878a.43.43 0 0 0 .027.812l3.398 1.06"
    />
  </svg>
);
export default TgIcon;