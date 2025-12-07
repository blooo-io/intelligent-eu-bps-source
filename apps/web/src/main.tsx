import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App as AntApp, Spin } from "antd";
import "antd/dist/reset.css";
import { loadConfig } from "./api/config";
import { createOidcFacade, createUserManager } from "./auth/oidc";
import { App } from "./App";

async function bootstrap() {
  const rootEl = document.getElementById("root");
  if (!rootEl) throw new Error("Missing #root");

  const root = createRoot(rootEl);
  root.render(
    <AntApp>
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <Spin size="large" />
      </main>
    </AntApp>,
  );

  const config = await loadConfig();
  const oidc = createOidcFacade(createUserManager(config));
  root.render(
    <StrictMode>
      <App config={config} oidc={oidc} />
    </StrictMode>,
  );
}

void bootstrap();
