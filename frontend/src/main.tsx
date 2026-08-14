import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css"; // 全局样式：CSS 变量、reset、滚动条

ReactDOM.createRoot(document.getElementById("root")!).render(
  // StrictMode 在开发模式下会额外渲染一次，帮助检测副作用问题，生产构建自动移除
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
