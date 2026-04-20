// dashboard/src/main.jsx
//
// Entry point for the React dashboard.
// Mounts the App component into the #root div in index.html.

import React    from "react";
import ReactDOM from "react-dom/client";
import App      from "./App";

// ─── Global base styles ───────────────────────────────────────────────────────
// Minimal reset + base typography applied globally.
// All component-level styles are handled inline in each component.

const globalStyles = `
  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  html {
    font-size: 16px;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  body {
    font-family: system-ui, -apple-system, BlinkMacSystemFont,
                 "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 14px;
    line-height: 1.6;
    color: #2C2C2A;
    background: #F6F5F0;
  }

  code, pre, .mono {
    font-family: "SF Mono", "Fira Code", "Fira Mono",
                 "Roboto Mono", Menlo, Consolas, monospace;
  }

  a {
    color: #185FA5;
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }

  button {
    font-family: inherit;
  }

  select, input {
    font-family: inherit;
  }
`;

// Inject global styles into the document head
const styleTag = document.createElement("style");
styleTag.textContent = globalStyles;
document.head.appendChild(styleTag);

// ─── Mount ────────────────────────────────────────────────────────────────────

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
