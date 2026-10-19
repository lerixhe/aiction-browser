import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react"

/** className 拼接（假的过滤掉） */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ")
}

// ── Button ────────────────────────────────────────────────────────────────

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger"

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: "sm" | "md"
  icon?: ReactNode
}

export function Button({ variant = "secondary", size = "md", icon, children, className, type, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      type={type ?? "button"}
      className={cx("opt-btn", `opt-btn--${variant}`, size === "sm" && "opt-btn--sm", className)}>
      {icon}
      {children}
    </button>
  )
}

// ── SegmentedControl ──────────────────────────────────────────────────────

interface SegmentedControlProps<T extends string> {
  value: T
  options: { value: T; label: string }[]
  onValueChange: (value: T) => void
  ariaLabel: string
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onValueChange,
  ariaLabel
}: SegmentedControlProps<T>) {
  return (
    <div className="opt-segmented" role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className="opt-segment"
          onClick={() => onValueChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  )
}

// ── 文本类控件 ────────────────────────────────────────────────────────────

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "className"> {
  value: string
  onValueChange: (value: string) => void
  mono?: boolean
}

export function TextField({ value, onValueChange, mono, ...rest }: TextFieldProps) {
  return (
    <input
      {...rest}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      className={cx("opt-input", mono && "opt-mono")}
    />
  )
}

interface NumberFieldProps {
  id?: string
  value: number | undefined
  onValueChange: (value: number | undefined) => void
  min?: number
  max?: number
  placeholder?: string
  ariaLabel?: string
}

/** 数值输入：空 = 未填充（该参数不随请求发送） */
export function NumberField({ id, value, onValueChange, min, max, placeholder, ariaLabel }: NumberFieldProps) {
  return (
    <input
      id={id}
      type="number"
      className="opt-input"
      value={value ?? ""}
      min={min}
      max={max}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(event) => {
        const raw = event.target.value
        if (raw === "") {
          onValueChange(undefined)
          return
        }
        const next = Number(raw)
        onValueChange(Number.isFinite(next) ? next : undefined)
      }}
    />
  )
}

interface SelectFieldProps {
  id?: string
  value: string
  onValueChange: (value: string) => void
  options?: { value: string; label: string }[]
  /** 允许额外的 option 子节点（例如带 optgroup 的语音列表） */
  children?: ReactNode
  ariaLabel?: string
  disabled?: boolean
}

export function SelectField({
  id,
  value,
  onValueChange,
  options,
  children,
  ariaLabel,
  disabled
}: SelectFieldProps) {
  return (
    <select
      id={id}
      className="opt-select"
      value={value}
      aria-label={ariaLabel}
      disabled={disabled}
      onChange={(event) => onValueChange(event.target.value)}>
      {options?.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
      {children}
    </select>
  )
}

interface TextAreaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange" | "className"> {
  value: string
  onValueChange: (value: string) => void
  mono?: boolean
}

export function TextArea({ value, onValueChange, mono, ...rest }: TextAreaProps) {
  return (
    <textarea
      {...rest}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      className={cx("opt-textarea", mono && "opt-mono")}
    />
  )
}

// ── Chip ─────────────────────────────────────────────────────────────────

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** chip 主文案（等宽，通常是占位符 token） */
  token: string
  label?: string
}

export function Chip({ token, label, className, type, ...rest }: ChipProps) {
  return (
    <button {...rest} type={type ?? "button"} className={cx("opt-chip", className)}>
      <span className="opt-mono">{token}</span>
      {label ? <span className="opt-chip-label">{label}</span> : null}
    </button>
  )
}

// ── 结构件 ────────────────────────────────────────────────────────────────

interface FieldGroupProps {
  title?: string
  children: ReactNode
}

/** 详情区内部分组：组标题 + 行式内容（危险区单独用 DangerZone） */
export function FieldGroup({ title, children }: FieldGroupProps) {
  return (
    <div className="opt-group">
      {title ? <h3 className="opt-group-title">{title}</h3> : null}
      {children}
    </div>
  )
}

interface DangerZoneProps {
  title: string
  desc: string
  action: ReactNode
}

export function DangerZone({ title, desc, action }: DangerZoneProps) {
  return (
    <div className="opt-danger">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="opt-danger-title">{title}</div>
        <div className="opt-danger-desc">{desc}</div>
      </div>
      {action}
    </div>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="opt-empty">{children}</div>
}

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cx("opt-skeleton", className)} style={style} aria-hidden="true" />
}

export function StatusMessage({ tone, children }: { tone: "success" | "error"; children: ReactNode }) {
  return (
    <div className={cx("opt-status", `opt-status--${tone}`)} role="status" aria-live="polite">
      {children}
    </div>
  )
}

export function Hint({ warning, children }: { warning?: boolean; children: ReactNode }) {
  return <p className={cx("opt-hint", warning && "opt-hint--warning")}>{children}</p>
}
