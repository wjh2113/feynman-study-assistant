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
export const Bell = icon(
  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />,
  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
);
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
export const LogOut = icon(<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />, <path d="M16 17l5-5-5-5M21 12H9" />);
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
export const Bot = icon(<path d="M12 8V4" />, <rect x="4" y="8" width="16" height="12" rx="3" />, <circle cx="9" cy="14" r="1" fill="currentColor" stroke="none" />, <circle cx="15" cy="14" r="1" fill="currentColor" stroke="none" />);
export const User = icon(<circle cx="12" cy="8" r="3.5" />, <path d="M5 19a7 7 0 0 1 14 0" />);
export const Lock = icon(<rect x="5" y="11" width="14" height="10" rx="2" />, <path d="M8 11V8a4 4 0 0 1 8 0v3" />);
export const ExternalLink = icon(<path d="M14 5h5v5" />, <path d="M10 14 19 5" />, <path d="M19 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />);
export const Pencil = icon(<path d="M12 20h9" />, <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />);
export const ThumbsUp = icon(<path d="M7 10v11H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z" />, <path d="M7 10 11 3a2 2 0 0 1 2 2v4h6.2a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 18 20H7" />);
export const Maximize2 = icon(<path d="M15 3h6v6M9 21H3v-6" />, <path d="M21 3 14 10M3 21l7-7" />);
export const Minimize2 = icon(<path d="M4 14h6v6M14 10h6V4" />, <path d="M10 14 3 21M21 3l-7 7" />);
export const Calendar = icon(<rect x="3" y="5" width="18" height="16" rx="2" />, <path d="M8 3v4M16 3v4M3 11h18" />);
export const Tag = icon(<path d="M12 2 2 12l8 8 10-10V2Z" />, <circle cx="8.5" cy="7.5" r="1" fill="currentColor" stroke="none" />);
export const BarChart2 = icon(<path d="M6 20V10M12 20V4M18 20v-7" />);
export const Info = icon(<circle cx="12" cy="12" r="9" />, <path d="M12 11v6M12 8h.01" />);
export const ZoomIn = icon(<circle cx="11" cy="11" r="7" />, <path d="m20 20-4-4M11 8v6M8 11h6" />);
export const ZoomOut = icon(<circle cx="11" cy="11" r="7" />, <path d="m20 20-4-4M8 11h6" />);
export const Play = icon(<path d="m8 5 12 7-12 7Z" />);
export const Clock = icon(<circle cx="12" cy="12" r="9" />, <path d="M12 7v5l3.5 2" />);
export const Baby = icon(<circle cx="12" cy="12" r="9" />, <path d="M9 10h.01M15 10h.01M8 15s1.5 2 4 2 4-2 4-2" />);
export const Quote = icon(<path d="M7 11h4v8H5v-6a4 4 0 0 1 4-4Z" />, <path d="M17 11h4v8h-6v-6a4 4 0 0 1 4-4Z" />);
export const Save = icon(<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />, <path d="M17 21v-8H7v8M7 3v5h8" />);
export const Archive = icon(<rect x="3" y="4" width="18" height="4" rx="1" />, <path d="M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8M10 12h4" />);
export const Filter = icon(<path d="M4 5h16l-6 8v5l-4 2v-7Z" />);
export const ListTree = icon(
  <path d="M8 6h13M8 12h13M8 18h13" />,
  <path d="M3 6h.01M3 12h.01M3 18h.01" />
);
export const Share2 = icon(
  <circle cx="18" cy="5" r="3" />,
  <circle cx="6" cy="12" r="3" />,
  <circle cx="18" cy="19" r="3" />,
  <path d="m8.6 13.5 6.8 4M8.6 10.5l6.8-4" />
);
export const Eye = icon(<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />, <circle cx="12" cy="12" r="3" />);
