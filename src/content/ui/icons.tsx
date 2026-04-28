import React from "react";

const IconProps = {
  className: "spx-icon",
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const
};

export const Plus = () => (
  <svg {...IconProps}>
    <path d="M12 5v14m-7-7h14" />
  </svg>
);

export const Trash = () => (
  <svg {...IconProps}>
    <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2m-6 5v6m4-6v6" />
  </svg>
);

export const LinkIcon = () => (
  <svg {...IconProps}>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

export const ChevronUp = () => (
  <svg {...IconProps}>
    <path d="m18 15-6-6-6 6" />
  </svg>
);

export const ChevronDown = () => (
  <svg {...IconProps}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const Check = () => (
  <svg {...IconProps}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const X = () => (
  <svg {...IconProps}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export const Search = () => (
  <svg {...IconProps}>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

export const RefreshCw = () => (
  <svg {...IconProps}>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </svg>
);

export const Clipboard = () => (
  <svg {...IconProps}>
    <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
  </svg>
);

export const Upload = () => (
  <svg {...IconProps}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
  </svg>
);

export const Download = () => (
  <svg {...IconProps}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
  </svg>
);

export const RotateCcw = () => (
  <svg {...IconProps}>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </svg>
);

export const AlertCircle = () => (
  <svg {...IconProps}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);
