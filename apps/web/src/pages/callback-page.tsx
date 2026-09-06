import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Spin, Typography } from "antd";
import type { OidcFacade } from "../auth/oidc";

const { Text } = Typography;

/** OIDC redirect landing — exchanges the code for tokens (PKCE). */
export function CallbackPage({ oidc }: Readonly<{ oidc: OidcFacade }>) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    oidc
      .handleCallback()
      .then(() => {
        if (!cancelled) navigate("/", { replace: true });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Sign-in failed");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [oidc, navigate]);

  if (error) {
    return (
      <main style={{ padding: 48 }}>
        <Text type="danger">{error}</Text>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <Spin size="large" tip="Completing sign-in…">
        <div style={{ padding: 48 }} />
      </Spin>
    </main>
  );
}
