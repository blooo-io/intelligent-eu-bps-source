import { useEffect, useState } from "react";
import type { WebConfig } from "../api/config";
import { fetchMe, type ParticipantRole } from "../api/me";
import type { OidcFacade } from "../auth/oidc";
import { fetchMyPaymentAccount, type MePaymentAccount } from "../api/payment";

export function usePaymentSetupMe(config: WebConfig, oidc: OidcFacade) {
  const [marketRole, setMarketRole] = useState<ParticipantRole | null>(null);
  const [readiness, setReadiness] = useState<string | null>(null);
  const [account, setAccount] = useState<MePaymentAccount | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await oidc.getAccessToken();
        if (!token) return;
        const me = await fetchMe(config.apiBaseUrl, token);
        if (!cancelled) {
          setMarketRole(me.role);
          setReadiness(me.readiness);
        }
        if (me.readiness !== "Ready") return;
        try {
          const summary = await fetchMyPaymentAccount(config.apiBaseUrl, token);
          if (!cancelled) setAccount(summary);
        } catch {
          // Keep Ready chrome even if summary fails.
        }
      } catch {
        // Session mode still reveals consumer vs producer after Start.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [config.apiBaseUrl, oidc]);

  return { marketRole, readiness, account, setAccount };
}
