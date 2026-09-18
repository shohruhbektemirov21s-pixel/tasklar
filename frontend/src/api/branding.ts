import { useEffect, useState } from "react";
import { api } from "./client";

export interface SystemBranding {
  app_name: string;
  logo_url: string | null;
  updated_at?: string | null;
}

const DEFAULT_BRANDING: SystemBranding = {
  app_name: "TeamFlow",
  logo_url: null,
};

let cachedBranding: SystemBranding | null = null;
const listeners = new Set<(branding: SystemBranding) => void>();

export async function fetchSystemBranding(): Promise<SystemBranding> {
  try {
    const res = await api.get<SystemBranding>("/system/settings/");
    cachedBranding = res;
    notifyListeners(res);
    return res;
  } catch {
    if (!cachedBranding) {
      cachedBranding = DEFAULT_BRANDING;
    }
    return cachedBranding;
  }
}

export function getCachedBranding(): SystemBranding {
  return cachedBranding || DEFAULT_BRANDING;
}

export function setCachedBranding(b: SystemBranding) {
  cachedBranding = b;
  notifyListeners(b);
}

export function subscribeBranding(fn: (b: SystemBranding) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function notifyListeners(b: SystemBranding) {
  listeners.forEach((fn) => {
    try {
      fn(b);
    } catch {
      // ignore
    }
  });
}

export async function updateSystemBranding(formData: FormData): Promise<SystemBranding> {
  const res = await api.post<SystemBranding>("/system/settings/", formData);
  cachedBranding = res;
  notifyListeners(res);
  return res;
}

export function useSystemBranding(): SystemBranding {
  const [branding, setBranding] = useState<SystemBranding>(getCachedBranding());

  useEffect(() => {
    if (!cachedBranding) {
      void fetchSystemBranding().then(setBranding);
    }
    const unsub = subscribeBranding(setBranding);
    return unsub;
  }, []);

  return branding;
}
