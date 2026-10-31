import React, { ButtonHTMLAttributes, forwardRef, useState } from 'react'
import { cn } from '../../lib/utils'
import { Loader2, Check, X } from 'lucide-react'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | 'success' | 'warning' | 'gradient'
  size?: 'default' | 'sm' | 'lg' | 'xl' | 'icon' | 'xs'
  loading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  fullWidth?: boolean
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'full'
}

const buttonVariants = {
  default:
    'bg-card border border-border text-foreground hover:bg-muted focus-visible:ring-ring shadow-sm',
  primary:
    'bg-primary-600 text-white hover:bg-primary-700 focus-visible:ring-primary-500/40 shadow-sm',
  destructive:
    'bg-destructive text-destructive-foreground hover:opacity-90 focus-visible:ring-destructive/40 shadow-sm',
  outline:
    'bg-transparent border border-border text-foreground hover:bg-muted focus-visible:ring-ring',
  secondary:
    'bg-secondary text-secondary-foreground hover:bg-muted focus-visible:ring-ring',
  ghost:
    'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring',
  link: 'bg-transparent text-primary-600 underline-offset-4 hover:underline focus-visible:ring-primary-500/40 p-0 h-auto dark:text-primary-400',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500/40 shadow-sm',
  warning: 'bg-amber-600 text-white hover:bg-amber-700 focus-visible:ring-amber-500/40 shadow-sm',
  /* Atlas: solid primary — no purple gradient */
  gradient: 'bg-primary-600 text-white hover:bg-primary-700 focus-visible:ring-primary-500/40 shadow-sm',
}

const buttonSizes = {
  xs: 'h-6 px-2 text-xs',
  sm: 'h-8 px-3 text-xs',
  default: 'h-10 px-4 py-2 text-sm',
  lg: 'h-11 px-6 text-base',
  xl: 'h-12 px-8 text-lg',
  icon: 'h-10 w-10'
}

const buttonRounded = {
  none: 'rounded-none',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  full: 'rounded-full'
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({
    className = '',
    variant = 'default',
    size = 'default',
    loading = false,
    leftIcon,
    rightIcon,
    fullWidth = false,
    rounded = 'lg',
    disabled,
    children,
    ...props
  }, ref) => {
    const isDisabled = disabled || loading

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center font-sans font-medium',
          'transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'disabled:pointer-events-none disabled:opacity-50',
          'active:scale-[0.98] motion-reduce:active:scale-100',
          buttonVariants[variant],
          buttonSizes[size],
          buttonRounded[rounded],
          fullWidth && 'w-full',
          className
        )}
        disabled={isDisabled}
        {...props}
      >
        {loading && (
          <Loader2 className={cn('animate-spin', size === 'icon' ? 'h-4 w-4' : 'mr-2 h-4 w-4')} />
        )}
        {!loading && leftIcon && (
          <span className={cn('flex items-center', size !== 'icon' && 'mr-2')}>
            {leftIcon}
          </span>
        )}
        {size !== 'icon' && !loading && children}
        {size === 'icon' && !loading && !leftIcon && children}
        {!loading && rightIcon && (
          <span className={cn('flex items-center', size !== 'icon' && 'ml-2')}>
            {rightIcon}
          </span>
        )}
      </button>
    )
  }
)

Button.displayName = 'Button'

// Icon Button - specialized for icon-only buttons
export interface IconButtonProps extends Omit<ButtonProps, 'leftIcon' | 'rightIcon' | 'children'> {
  icon: React.ReactNode
  'aria-label': string
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, className, size = 'icon', ...props }, ref) => {
    return (
      <Button
        ref={ref}
        size={size}
        className={className}
        {...props}
      >
        {icon}
      </Button>
    )
  }
)
IconButton.displayName = 'IconButton'

// Button Group for related actions
export interface ButtonGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical'
  size?: ButtonProps['size']
  variant?: ButtonProps['variant']
}

export const ButtonGroup = forwardRef<HTMLDivElement, ButtonGroupProps>(
  ({ className, orientation = 'horizontal', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'inline-flex',
          orientation === 'horizontal' ? 'flex-row' : 'flex-col',
          '[&>button]:rounded-none',
          orientation === 'horizontal' ? [
            '[&>button:first-child]:rounded-l-lg',
            '[&>button:last-child]:rounded-r-lg',
            '[&>button:not(:first-child)]:border-l-0'
          ] : [
            '[&>button:first-child]:rounded-t-lg',
            '[&>button:last-child]:rounded-b-lg',
            '[&>button:not(:first-child)]:border-t-0'
          ],
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)
ButtonGroup.displayName = 'ButtonGroup'

// Toggle Button for on/off states
export interface ToggleButtonProps extends Omit<ButtonProps, 'variant'> {
  pressed?: boolean
  onPressedChange?: (pressed: boolean) => void
  pressedVariant?: ButtonProps['variant']
  unpressedVariant?: ButtonProps['variant']
}

export const ToggleButton = forwardRef<HTMLButtonElement, ToggleButtonProps>(
  ({ 
    pressed = false, 
    onPressedChange, 
    pressedVariant = 'primary', 
    unpressedVariant = 'outline',
    onClick,
    ...props 
  }, ref) => {
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      onPressedChange?.(!pressed)
      onClick?.(e)
    }

    return (
      <Button
        ref={ref}
        variant={pressed ? pressedVariant : unpressedVariant}
        onClick={handleClick}
        aria-pressed={pressed}
        {...props}
      />
    )
  }
)
ToggleButton.displayName = 'ToggleButton'

// Floating Action Button
export interface FloatingActionButtonProps extends Omit<ButtonProps, 'size' | 'variant'> {
  size?: 'default' | 'lg'
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  icon: React.ReactNode
}

export const FloatingActionButton = forwardRef<HTMLButtonElement, FloatingActionButtonProps>(
  ({ 
    size = 'default', 
    position = 'bottom-right',
    icon,
    className,
    ...props 
  }, ref) => {
    const positionClasses = {
      'bottom-right': 'fixed bottom-6 right-6',
      'bottom-left': 'fixed bottom-6 left-6',
      'top-right': 'fixed top-6 right-6',
      'top-left': 'fixed top-6 left-6'
    }

    const fabSizes = {
      default: 'h-14 w-14',
      lg: 'h-16 w-16'
    }

    return (
      <Button
        ref={ref}
        variant="primary"
        rounded="full"
        className={cn(
          'shadow-lg hover:shadow-xl z-50',
          positionClasses[position],
          fabSizes[size],
          className
        )}
        {...props}
      >
        {icon}
      </Button>
    )
  }
)
FloatingActionButton.displayName = 'FloatingActionButton'

// Confirm Button with built-in confirmation state
export interface ConfirmButtonProps extends ButtonProps {
  confirmText?: string
  confirmVariant?: ButtonProps['variant']
  confirmTimeout?: number
  onConfirm?: () => void
}

export const ConfirmButton = forwardRef<HTMLButtonElement, ConfirmButtonProps>(
  ({ 
    children,
    confirmText = 'Confirm?',
    confirmVariant = 'destructive',
    confirmTimeout = 3000,
    onConfirm,
    onClick,
    ...props 
  }, ref) => {
    const [isConfirming, setIsConfirming] = useState(false)

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (isConfirming) {
        onConfirm?.()
        setIsConfirming(false)
      } else {
        setIsConfirming(true)
        setTimeout(() => setIsConfirming(false), confirmTimeout)
      }
      onClick?.(e)
    }

    return (
      <Button
        ref={ref}
        variant={isConfirming ? confirmVariant : props.variant}
        onClick={handleClick}
        leftIcon={isConfirming ? <Check className="h-4 w-4" /> : props.leftIcon}
        {...props}
      >
        {isConfirming ? confirmText : children}
      </Button>
    )
  }
)
ConfirmButton.displayName = 'ConfirmButton'

export { Button }
