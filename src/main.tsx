import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles/global.css";
import "./styles/themes/pipboy.css";
import "@fontsource/cormorant/latin-500.css";
import "@fontsource/cormorant/latin-500-italic.css";
import "@fontsource/cormorant/latin-700.css";
import "@fontsource/cormorant-unicase/latin-600.css";
import "@fontsource/cormorant-unicase/latin-700.css";
import "./styles/themes/gilmore.css";
import "./styles/themes/clippy.css";
import { initTheme } from "./state/theme";

initTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
