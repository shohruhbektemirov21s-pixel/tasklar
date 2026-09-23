import type { ComponentPropsWithRef, ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";

/**
 * Ilovadagi YAGONA tugma.
 *
 * Tugma ko'rinishi faqat shu yerda va `app.css` dagi «BUTTONS» bo'limida
 * belgilanadi. Sahifa rang, padding yoki radiusni `style` bilan bermaydi -
 * kerakli ko'rinish yo'q bo'lsa, variant shu yerga qo'shiladi.
 *
 * React 19: `ref` oddiy prop sifatida o'tadi, `forwardRef` kerak emas.
 */
export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "success"
  | "warning"
  | "link";

export type ButtonSize = "xs" | "sm" | "md" | "lg";

type Look = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Konteynerning butun kengligi. */
  block?: boolean;
  /** Faqat ikonka - kvadrat tugma. `aria-label` yoki `title` shart. */
  iconOnly?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  /** Amal ketyapti: aylanma ko'rinadi va tugma bosilmaydi. */
  loading?: boolean;
  /** Tanlangan holat (filtr, tab) - `ButtonGroup` ichida ishlatiladi. */
  active?: boolean;
};

export function buttonClass({
  variant = "secondary",
  size = "md",
  block,
  iconOnly,
  loading,
  active,
  className,
}: Look & { className?: string }) {
  return [
    "btn",
    `btn-${variant}`,
    size !== "md" && `btn-${size}`,
    block && "btn-block",
    iconOnly && "btn-icon",
    loading && "is-loading",
    active && "is-active",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

function Content({ icon, iconRight, loading, children }: Pick<Look, "icon" | "iconRight" | "loading"> & { children?: ReactNode }) {
  return (
    <>
      {loading ? <span className="btn-spinner" aria-hidden="true" /> : icon}
      {children}
      {iconRight}
    </>
  );
}

type ButtonProps = Look & ComponentPropsWithRef<"button">;

export function Button({
  variant, size, block, iconOnly, icon, iconRight, loading, active,
  className, type = "button", disabled, children, ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-pressed={active === undefined ? rest["aria-pressed"] : active}
      className={buttonClass({ variant, size, block, iconOnly, loading, active, className })}
    >
      <Content icon={icon} iconRight={iconRight} loading={loading}>{children}</Content>
    </button>
  );
}

type LinkButtonProps = Omit<Look, "loading"> & LinkProps & { ref?: ComponentPropsWithRef<"a">["ref"] };

/** Sahifa ichidagi o'tish, tugma ko'rinishida. */
export function LinkButton({
  variant, size, block, iconOnly, icon, iconRight, active, className, children, ...rest
}: LinkButtonProps) {
  return (
    <Link {...rest} className={buttonClass({ variant, size, block, iconOnly, active, className })}>
      <Content icon={icon} iconRight={iconRight}>{children}</Content>
    </Link>
  );
}

type AnchorButtonProps = Omit<Look, "loading"> & ComponentPropsWithRef<"a">;

/** Tashqi havola yoki fayl yuklash, tugma ko'rinishida. */
export function AnchorButton({
  variant, size, block, iconOnly, icon, iconRight, active, className, children, ...rest
}: AnchorButtonProps) {
  return (
    <a {...rest} className={buttonClass({ variant, size, block, iconOnly, active, className })}>
      <Content icon={icon} iconRight={iconRight}>{children}</Content>
    </a>
  );
}

/**
 * Yonma-yon tugmalar: filtr, ko'rinish tanlash, tab.
 *
 * Ichidagi tugmalarga `active` beriladi - tanlangani ajralib turadi, qolgani
 * bir xil fonda. Har sahifa buni `btn-primary`/`btn-ghost` almashtirib
 * o'zicha yasardi va har birida boshqacha chiqardi.
 */
export function ButtonGroup({ className, ...rest }: ComponentPropsWithRef<"div">) {
  return <div role="group" {...rest} className={["btn-group", className].filter(Boolean).join(" ")} />;
}
