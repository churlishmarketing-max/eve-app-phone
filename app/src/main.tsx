import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Root from "./Root";

// Root, not EveApp: the deck only mounts once a token is known to be on the
// device (src/Root.tsx). The pairing screen is the whole app until then.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
