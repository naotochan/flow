import type { ReactNode } from "react";

/** Fennec mark — filled app tile, or ghost (transparent) for light surfaces. */
export function AppMark({
  size = 28,
  className = "",
  variant = "filled",
}: {
  size?: number;
  className?: string;
  variant?: "filled" | "ghost";
}) {
  if (variant === "ghost") {
    return (
      <span
        className={`flex-shrink-0 app-mark-ghost ${className}`}
        style={{ width: size, height: size }}
        aria-hidden="true"
      />
    );
  }

  const radius = Math.max(6, Math.round(size * 0.22));
  return (
    <img
      src="/app-icon.png"
      alt=""
      width={size}
      height={size}
      draggable={false}
      className={`flex-shrink-0 object-cover app-mark ${className}`}
      style={{ width: size, height: size, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}

export function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-xs font-medium text-[var(--text-muted)]"
    >
      {children}
    </label>
  );
}

export function FieldHint({ children }: { children: ReactNode }) {
  return <p className="text-[11px] text-[var(--text-faint)]">{children}</p>;
}

export function SettingsRow({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--text)]">{title}</p>
        {description && (
          <p className="text-[11px] text-[var(--text-faint)] mt-0.5 leading-relaxed">
            {description}
          </p>
        )}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex gap-1.5 bg-[var(--bg-muted)] rounded-lg p-0.5"
    >
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            className={`flex-1 px-2.5 py-2 rounded-md text-sm whitespace-nowrap transition-[background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
              selected
                ? "bg-[var(--accent-soft)] text-[var(--accent-text)] font-medium shadow-sm"
                : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-elevated)]/60"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export const inputClass =
  "w-full border rounded-lg px-3 py-2 text-sm bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] focus-visible:border-[var(--accent)]";

export const monoInputClass = `${inputClass} font-mono`;
