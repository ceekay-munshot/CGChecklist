"use client";

import { useEffect, useRef } from "react";
import { useCompany } from "@/lib/state/CompanyContext";
import { useToast } from "@/lib/state/ToastContext";

export function RefreshNotifier() {
  const { state } = useCompany();
  const { push } = useToast();
  const prevStatusRef = useRef(state.status);

  useEffect(() => {
    const prev = prevStatusRef.current;
    if (prev === "loading" && state.status === "ready") {
      push({
        tone: "success",
        title: "Live data loaded",
        description: state.identity.name
          ? `Latest governance analysis is now live for ${state.identity.name}.`
          : "Latest governance analysis is now live for the selected company.",
      });
    } else if (prev === "loading" && state.status === "error") {
      push({
        tone: "error",
        title: "Refresh failed",
        description:
          state.message ||
          "We couldn't reach the analysis service. Please try again.",
      });
    }
    prevStatusRef.current = state.status;
  }, [state.status, state.message, state.identity.name, push]);

  return null;
}
