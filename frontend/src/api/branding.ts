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

const BRANDING_STORAGE_KEY = "teamflow.branding";

function loadStoredBranding(): SystemBranding {
  try {
    const raw = localStorage.getItem(BRANDING_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.app_name === "string") {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_BRANDING;
}

let cachedBranding: SystemBranding | null = null;
const listeners = new Set<(branding: SystemBranding) => void>();

export async function fetchSystemBranding(): Promise<SystemBranding> {
  try {
    const res = await api.get<SystemBranding>("/system/settings/");
    cachedBranding = res;
    try {
      localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(res));
    } catch {
      // ignore
    }
    notifyListeners(res);
    return res;
  } catch {
    if (!cachedBranding) {
      cachedBranding = loadStoredBranding();
    }
    return cachedBranding;
  }
}

export function getCachedBranding(): SystemBranding {
  if (!cachedBranding) {
    cachedBranding = loadStoredBranding();
  }
  return cachedBranding;
}

export function setCachedBranding(b: SystemBranding) {
  cachedBranding = b;
  try {
    localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(b));
  } catch {
    // ignore
  }
  notifyListeners(b);
}

export function subscribeBranding(fn: (b: SystemBranding) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function notifyListeners(b: SystemBranding) {
  if (typeof document !== "undefined" && b.app_name) {
    const newName = b.app_name.trim();
    if (newName) {
      if (!document.title || document.title.includes("TeamFlow")) {
        document.title = document.title ? document.title.replace(/TeamFlow/g, newName) : newName;
      }
    }
  }
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
  try {
    localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(res));
  } catch {
    // ignore
  }
  notifyListeners(res);
  return res;
}

export function useSystemBranding(): SystemBranding {
  const [branding, setBranding] = useState<SystemBranding>(getCachedBranding());

  useEffect(() => {
    const current = getCachedBranding();
    setBranding(current);
    void fetchSystemBranding().then((b) => {
      setBranding(b);
    });
    const unsub = subscribeBranding(setBranding);
    return unsub;
  }, []);

  return branding;
}
