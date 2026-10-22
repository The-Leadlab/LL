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
    'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-gray-500/50 shadow-sm dark:bg-neutral-800 dark:border-neutral-600 dark:text-neutral-100 dark:hover:bg-neutral-700',
  primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500/50 shadow-sm',
  destructive: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500/50 shadow-sm',
  outline:
    'bg-transparent border border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-gray-500/50 dark:border-neutral-600 dark:text-neutral-100 dark:hover:bg-neutral-800',
  secondary:
    'bg-gray-100 text-gray-900 hover:bg-gray-200 focus:ring-gray-500/50 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600',
  ghost:
    'bg-transparent text-gray-700 hover:bg-gray-100 focus:ring-gray-500/50 dark:text-neutral-200 dark:hover:bg-neutral-800',
  link: 'bg-transparent text-blue-600 underline-offset-4 hover:underline focus:ring-blue-500/50 p-0 h-auto dark:text-blue-400',
  success: 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500/50 shadow-sm',
  warning: 'bg-yellow-600 text-white hover:bg-yellow-700 focus:ring-yellow-500/50 shadow-sm',
  gradient: 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700 focus:ring-blue-500/50 shadow-sm',
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
          'inline-flex items-center justify-center font-medium transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
          'active:scale-95',
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
