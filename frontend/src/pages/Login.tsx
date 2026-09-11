import { useEffect, useId, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { Logo } from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { ErrorMsg, PasswordInput } from "@/components/ui";
import { tx } from "@/i18n";

export default function Login() {
  const fid = useId();
  const { login } = useAuth();
  const nav = useNavigate();
  // `Protected` bu yerga otganda qaysi sahifa so'ralganini holatda qoldiradi.
  const next = (useLocation().state as { next?: string } | null)?.next;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failCount, setFailCount] = useState(0);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);

  // 30 soniyalik qulf taymeri (har sekundda kamayadi)
  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const timer = setInterval(() => {
      setLockoutSeconds((s) => {
        if (s <= 1) {
          clearInterval(timer);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutSeconds]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (lockoutSeconds > 0) return;
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      setFailCount(0);
      setLockoutSeconds(0);
      // Odam qaysidir sahifaga kirmoqchi bo'lib bu yerga otilgan bo'lsa
      // (`Protected`), kirgandan keyin o'sha yerga qaytadi - masalan
      // Telegramdagi «Ochish» tugmasi bosilganda. Aks holda u har safar
      // «Bosh panel» ga tushib, qidirgan ishini qo'lda topishi kerak edi.
      nav(next || "/panel", { replace: true });
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : tx("login.kirishda_xatolik");
      // Agar backend qolgan soniyani yuborgan bo'lsa
      const match = msg.match(/(\d+)\s+soniyadan/);
      if (match) {
        const sec = parseInt(match[1], 10);
        setLockoutSeconds(sec > 0 ? sec : 30);
      } else {
        const nextFails = failCount + 1;
        setFailCount(nextFails);
        if (nextFails >= 5) {
          setLockoutSeconds(30);
          setFailCount(0);
        }
      }
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      {/* Kirish sahifasida sarlavha yo'q - burchaklarda ikkita boshqaruv
          turadi: chapda ortga qaytish, o'ngda rejim tugmasi. */}
      <div className="auth-back">
        <Link to="/">{tx("login.bosh_sahifa")}</Link>
      </div>
      <ThemeToggle className="top-icon theme-float" />
      <div className="auth-card">
        <div className="auth-head">
          <Logo size={46} />
          <h2>{tx("login.hisobingizga_kiring")}</h2>
          <p>{tx("login.teamflow_jamoa_vazifalarini_boshqarish_tizim")}</p>
        </div>

        <ErrorMsg error={error} />

        <div className="auth-box">
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor={`${fid}-0`}>{tx("login.email")}</label>
              {/* `type="email"` emas: brauzer "@" yo'q qiymatni o'zi to'sib qo'yadi va
                  xizmat hisoblari (masalan `admin`) bilan kirib bo'lmasdi. Tekshiruv
                  serverda qoladi - `EmailBackend` baribir emailni topa olmasa rad etadi. */}
              <input id={`${fid}-0`} type="text" inputMode="email" value={email} autoFocus required
                     name="username" autoComplete="username"
                     onChange={(e) => setEmail(e.target.value)} placeholder="siz@example.com" />
            </div>
            <div className="field">
              <label htmlFor={`${fid}-1`}>{tx("common.parol")}</label>
              <PasswordInput id={`${fid}-1`} value={password} required autoComplete="current-password"
                             onChange={setPassword} placeholder="parolingiz" />
            </div>
            {lockoutSeconds > 0 && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  background: "rgba(239, 68, 68, 0.12)",
                  border: "1px solid rgba(239, 68, 68, 0.35)",
                  color: "var(--danger, #dc2626)",
                  fontSize: 12.5,
                  fontWeight: 600,
                  marginBottom: 14,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  lineHeight: 1.4,
                }}
              >
                <span style={{ fontSize: 16 }}>⏳</span>
                <span>Xavfsizlik blokirovkasi: {lockoutSeconds} soniyadan so'ng qayta urinishingiz mumkin.</span>
              </div>
            )}
            <button className="btn btn-primary btn-block" disabled={busy || lockoutSeconds > 0}>
              {busy
                ? tx("login.tekshirilmoqda")
                : lockoutSeconds > 0
                ? `Qayta urinish: ${lockoutSeconds}s`
                : tx("common.kirish")}
            </button>
          </form>
        </div>

        <div className="auth-alt">
          {tx("login.hisobingiz_yoqmi")} <Link to="/royxatdan-otish">{tx("login.royxatdan_oting")}</Link>
        </div>
      </div>
    </div>
  );
}
