import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import EveApp from "./EveApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <EveApp />
  </StrictMode>,
);
