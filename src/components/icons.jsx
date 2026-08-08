import React from "react";

const icon = (...children) =>
  function Icon({ size = 24, strokeWidth = 2, ...props }) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...props}
      >
        {children.map((child, index) => React.cloneElement(child, { key: index }))}
      </svg>
    );
  };

export const ArrowRight = icon(<path d="M5 12h14M13 6l6 6-6 6" />);
export const BookMarked = icon(<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />, <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />, <path d="M10 2v8l3-2 3 2V2" />);
export const BrainCircuit = icon(<path d="M9.5 4.5A3 3 0 0 0 4 6v1a3 3 0 0 0-2 3 3 3 0 0 0 2 3v1a3 3 0 0 0 5.5 1.5" />, <path d="M14.5 4.5A3 3 0 0 1 20 6v1a3 3 0 0 1 2 3 3 3 0 0 1-2 3v1a3 3 0 0 1-5.5 1.5" />, <path d="M9.5 4.5v15M14.5 4.5v15M9.5 9H7M17 12h-2.5M9.5 15H7" />);
export const Check = icon(<path d="m5 12 4 4L19 6" />);
export const ChevronDown = icon(<path d="m6 9 6 6 6-6" />);
export const ChevronRight = icon(<path d="m9 18 6-6-6-6" />);
export const CircleAlert = icon(<circle cx="12" cy="12" r="9" />, <path d="M12 8v4M12 16h.01" />);
export const Clock3 = icon(<circle cx="12" cy="12" r="9" />, <path d="M12 7v5l3 2" />);
export const Download = icon(<path d="M12 3v12m-5-5 5 5 5-5M5 21h14" />);
export const FileText = icon(<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />, <path d="M14 2v6h6M8 13h8M8 17h6" />);
export const FolderOpen = icon(<path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v2H6l-3 8Z" />, <path d="M3 10h18l-3 9H4Z" />);
export const GraduationCap = icon(<path d="m2 10 10-5 10 5-10 5Z" />, <path d="M6 12v5c3 2 9 2 12 0v-5M22 10v6" />);
export const House = icon(<path d="m3 11 9-8 9 8" />, <path d="M5 10v10h14V10M9 20v-6h6v6" />);
export const Lightbulb = icon(<path d="M9 18h6M10 22h4" />, <path d="M8.5 15.5A6 6 0 1 1 15.5 15.5C14.5 16.2 14 17 14 18h-4c0-1-.5-1.8-1.5-2.5Z" />);
export const Menu = icon(<path d="M4 6h16M4 12h16M4 18h16" />);
export const MessageCircleQuestion = icon(<path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9 9 0 0 1-4-.9L3 21l1.8-4.4A8.5 8.5 0 1 1 21 11.5Z" />, <path d="M9.8 9a2.2 2.2 0 0 1 4.3.7c0 1.6-2.1 1.7-2.1 3M12 16h.01" />);
export const Mic = icon(<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />, <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8" />);
export const MoreHorizontal = icon(<circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />, <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />, <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />);
export const Plus = icon(<path d="M12 5v14M5 12h14" />);
export const RotateCcw = icon(<path d="M3 12a9 9 0 1 0 3-6.7L3 8" />, <path d="M3 3v5h5" />);
export const Search = icon(<circle cx="11" cy="11" r="7" />, <path d="m20 20-4-4" />);
export const Send = icon(<path d="m22 2-7 20-4-9-9-4Z" />, <path d="M22 2 11 13" />);
export const Settings = icon(<circle cx="12" cy="12" r="3" />, <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />);
export const Sparkles = icon(<path d="m12 3-1.2 3.4L7.5 8l3.3 1.6L12 13l1.2-3.4L16.5 8l-3.3-1.6ZM5 14l-.8 2.2L2 17l2.2.8L5 20l.8-2.2L8 17l-2.2-.8ZM19 13l-.8 2.2-2.2.8 2.2.8L19 19l.8-2.2L22 16l-2.2-.8Z" />);
export const Square = icon(<rect x="6" y="6" width="12" height="12" rx="1" />);
export const Target = icon(<circle cx="12" cy="12" r="9" />, <circle cx="12" cy="12" r="5" />, <circle cx="12" cy="12" r="1" />);
export const Trash2 = icon(<path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 10v7M14 10v7" />);
export const UploadCloud = icon(<path d="M16 16l-4-4-4 4M12 12v9" />, <path d="M20 17.5A5 5 0 0 0 18 8a7 7 0 0 0-13.5 2A4 4 0 0 0 5 18h2" />);
export const X = icon(<path d="m6 6 12 12M18 6 6 18" />);
export const Zap = icon(<path d="M13 2 3 14h8l-1 8 10-12h-8Z" />);
