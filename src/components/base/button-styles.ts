export type WuButtonVariant = 'solid' | 'outline' | 'ghost'
export type WuButtonTone = 'neutral' | 'accent' | 'danger'
export type WuButtonSize = 'xs' | 'sm' | 'md' | 'lg'

interface ButtonStyleOptions {
  variant?: WuButtonVariant
  tone?: WuButtonTone
  size?: WuButtonSize
  iconOnly?: boolean
  disabled?: boolean
  loading?: boolean
}

const sizes = {
  xs: 'min-h-24px rounded-4px text-12px leading-16px [--wu-button-icon-size:14px] [--wu-button-gap:4px]',
  sm: 'min-h-32px rounded-6px text-12px leading-18px [--wu-button-icon-size:16px] [--wu-button-gap:4px]',
  md: 'min-h-40px rounded-7px text-13px leading-20px [--wu-button-icon-size:18px] [--wu-button-gap:6px]',
  lg: 'min-h-44px rounded-7px text-14px leading-20px [--wu-button-icon-size:20px] [--wu-button-gap:6px]',
} satisfies Record<WuButtonSize, string>

const padding = { xs: 'px-6px py-3px', sm: 'px-8px py-6px', md: 'px-12px py-9px', lg: 'px-16px py-11px' }
const squares = { xs: 'h-24px w-24px p-0', sm: 'h-32px w-32px p-0', md: 'h-40px w-40px p-0', lg: 'h-44px w-44px p-0' }
const colors = {
  neutral: {
    solid: 'border-[var(--line)] bg-[#142a22] text-[#d7eadf]',
    outline: 'border-[var(--line)] bg-transparent text-[#c7dfd2]',
    ghost: 'border-transparent bg-transparent text-[#91ae9e]',
  },
  accent: {
    solid: 'border-transparent bg-[var(--accent)] text-[#092519]',
    outline: 'border-[#377c60] bg-transparent text-[var(--accent)]',
    ghost: 'border-transparent bg-transparent text-[var(--accent)]',
  },
  danger: {
    solid: 'border-transparent bg-[#ff8d7e] text-[#351710]',
    outline: 'border-[#91584e] bg-transparent text-[#ffad9f]',
    ghost: 'border-transparent bg-transparent text-[#ffad9f]',
  },
} satisfies Record<WuButtonTone, Record<WuButtonVariant, string>>
const interactions = {
  neutral: {
    solid: 'hover:border-[#477b68] hover:bg-[#1c3b2d] active:bg-[#244b39]',
    outline: 'hover:border-[#477b68] hover:bg-[#193329] active:bg-[#244b39]',
    ghost: 'hover:bg-[#183128] hover:text-[#e7f4ee] active:bg-[#244b39]',
  },
  accent: {
    solid: 'hover:bg-[#8fffd4] active:bg-[#4bd5a9]',
    outline: 'hover:border-[var(--accent)] hover:bg-[#193b2c] active:bg-[#245442]',
    ghost: 'hover:bg-[#193b2c] hover:text-[#b9ffe7] active:bg-[#245442]',
  },
  danger: {
    solid: 'hover:bg-[#ffad9f] active:bg-[#e87769]',
    outline: 'hover:border-[#ff8d7e] hover:bg-[#382019] active:bg-[#4b2922]',
    ghost: 'hover:bg-[#382019] hover:text-[#ffd0b8] active:bg-[#4b2922]',
  },
} satisfies Record<WuButtonTone, Record<WuButtonVariant, string>>

export function buttonClasses({ variant = 'outline', tone = 'neutral', size = 'md', iconOnly = false, disabled = false, loading = false }: ButtonStyleOptions = {}): string[] {
  return [
    'inline-flex min-w-0 shrink-0 select-none items-center justify-center gap-[var(--wu-button-gap)] border border-solid text-center font-inherit font-500 no-underline transition-colors duration-150 motion-reduce:transition-none',
    sizes[size],
    iconOnly ? squares[size] : padding[size],
    colors[tone][variant],
    disabled || loading ? 'opacity-50' : interactions[tone][variant],
    loading ? 'cursor-wait' : disabled ? 'cursor-not-allowed' : 'cursor-pointer',
  ]
}
