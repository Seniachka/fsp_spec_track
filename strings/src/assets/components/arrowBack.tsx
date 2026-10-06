import * as React from 'react'

const arrowBackIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" {...props} xmlns="http://www.w3.org/2000/svg">
    <path
      d="M5 12L19 12"
      stroke="black"
      strokeOpacity="0.85"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M10 7L5 12"
      stroke="black"
      strokeOpacity="0.85"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M10 17L5 12"
      stroke="black"
      strokeOpacity="0.85"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export default arrowBackIcon