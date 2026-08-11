import {
  BookMarked,
  BrainCircuit,
  FolderOpen,
  House,
  MessageCircleQuestion,
  Search,
  Target
} from "../components/icons.jsx";

export const subjectNavItems = [
  { id: "overview", label: "学习概览", icon: House },
  { id: "sources", label: "学习资料", icon: FolderOpen },
  { id: "map", label: "知识地图", icon: BrainCircuit },
  { id: "rag", label: "资料问答", icon: Search }
];

export const practiceNavItems = [
  { id: "coach", label: "费曼对练", icon: MessageCircleQuestion },
  { id: "blindspots", label: "盲区与复测", icon: Target },
  { id: "output", label: "学习成果", icon: BookMarked }
];

/** @deprecated use practiceNavItems */
export const chapterNavItems = practiceNavItems;

/** @deprecated use subjectNavItems + practiceNavItems */
export const navItems = [...subjectNavItems, ...practiceNavItems];

export const stageLabels = ["资料就绪", "掌握骨架", "费曼输出", "定向补漏", "成果沉淀"];
