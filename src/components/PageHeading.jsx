import React from "react";
import { Sparkles } from "./icons.jsx";

export function PageHeading({ eyebrow, title, description, action, demo }) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
        {demo && <div className="demo-banner-inline"><Sparkles size={14} /> 当前为演示模式，AI 生成由规则/模板代替。请在「模型设置」中配置 DeepSeek API Key。</div>}
      </div>
      {action}
    </div>
  );
}
