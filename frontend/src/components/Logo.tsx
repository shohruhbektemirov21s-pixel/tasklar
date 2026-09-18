/**
 * Tizim brend belgisi (Logo va nomi).
 */
import { useEffect, useState } from "react";
import { useSystemBranding } from "@/api/branding";
import { tx } from "@/i18n";

export function Logo({ size = 30 }: { size?: number }) {
  const branding = useSystemBranding();

  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  useEffect(() => {
    setFailedUrl(null);
  }, [branding.logo_url]);

  if (branding.logo_url && branding.logo_url !== failedUrl) {
    return (
      <img
        key={branding.logo_url}
        src={branding.logo_url}
        alt={branding.app_name || tx("common.teamflow")}
        onError={() => setFailedUrl(branding.logo_url)}
        style={{
          width: size,
          height: size,
          objectFit: "contain",
          borderRadius: Math.max(4, Math.round(size * 0.25)),
          display: "inline-block",
          verticalAlign: "middle",
        }}
      />
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-label={branding.app_name || tx("common.teamflow")}>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="var(--accent, #3562ff)" />
      <rect x="7" y="9" width="18" height="3.4" rx="1.7" fill="#fff" />
      <rect x="7" y="14.3" width="12.5" height="3.4" rx="1.7" fill="#fff" opacity="0.8" />
      <rect x="7" y="19.6" width="7" height="3.4" rx="1.7" fill="#fff" opacity="0.6" />
    </svg>
  );
}

export function LogoWord({ size = 30 }: { size?: number }) {
  const branding = useSystemBranding();
  return (
    <>
      <Logo size={size} />
      <span>{branding.app_name || tx("common.teamflow")}</span>
    </>
  );
}
