import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { WebConfig } from "../api/config";
import { fetchMe, type Me, type ReadinessStatus } from "../api/me";
import type { OidcFacade } from "../auth/oidc";

const STEP_KEYS = ["profile", "terms", "payment"] as const;
export type WizardStepKey = (typeof STEP_KEYS)[number];

export function stepFromReadiness(status: ReadinessStatus): WizardStepKey {
  switch (status) {
    case "Invited":
      return "profile";
    case "ProfileCompleted":
      return "terms";
    case "TermsAccepted":
      return "payment";
    case "Ready":
      return "payment";
    default:
      return "profile";
  }
}

export function stepIndex(key: WizardStepKey): number {
  return STEP_KEYS.indexOf(key);
}

function resolveCurrentStep(
  paramStep: string | null,
  suggested: WizardStepKey,
): WizardStepKey {
  if (paramStep && (STEP_KEYS as readonly string[]).includes(paramStep)) {
    return paramStep as WizardStepKey;
  }
  return suggested;
}

export function useOnboardingWizard(config: WebConfig, oidc: OidcFacade) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reloadMe = useCallback(async () => {
    const token = await oidc.getAccessToken();
    if (!token) throw new Error("No access token");
    return fetchMe(config.apiBaseUrl, token);
  }, [config.apiBaseUrl, oidc]);

  useEffect(() => {
    let cancelled = false;
    reloadMe()
      .then((result) => {
        if (!cancelled) setMe(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load profile");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadMe]);

  useEffect(() => {
    if (params.get("step") !== "pay") return;
    if (me?.readiness === "Ready") {
      navigate("/invoices", { replace: true });
      return;
    }
    setParams({ step: "payment" }, { replace: true });
  }, [params, me?.readiness, navigate, setParams]);

  const suggested = me ? stepFromReadiness(me.readiness) : "profile";
  const current = resolveCurrentStep(params.get("step"), suggested);

  function go(step: WizardStepKey) {
    setParams({ step });
  }

  async function afterGate() {
    try {
      const next = await reloadMe();
      setMe(next);
      if (next.readiness === "Ready") {
        navigate("/invoices");
        return;
      }
      go(stepFromReadiness(next.readiness));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    }
  }

  return {
    me,
    error,
    loading,
    current,
    stepNumber: stepIndex(current) + 1,
    go,
    afterGate,
  };
}

export { STEP_KEYS };
