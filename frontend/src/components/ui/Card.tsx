import React, { HTMLAttributes, forwardRef } from 'react';
import { cn } from '../../utils/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'outlined' | 'elevated' | 'ghost';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  divider?: boolean;
}

export interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {
  divider?: boolean;
}

const cardVariants = {
  default: 'bg-card text-card-foreground border border-border shadow-sm',
  outlined: 'bg-transparent border border-border',
  elevated: 'bg-card text-card-foreground border border-border shadow-md',
  ghost: 'bg-transparent border-0 shadow-none'
};

const paddingVariants = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6'
};

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', padding = 'md', ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-lg transition-[background-color,border-color] duration-150',
        cardVariants[variant],
        paddingVariants[padding],
        className
      )}
      {...props}
    />
  )
);
Card.displayName = 'Card';

const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, divider = false, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex flex-col space-y-1.5',
        divider && 'pb-4 border-b border-border mb-4',
        className
      )}
      {...props}
    />
  )
);
CardHeader.displayName = 'CardHeader';

const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn(
        'text-lg font-semibold leading-none tracking-tight text-foreground font-sans',
        className
      )}
      {...props}
    />
  )
);
CardTitle.displayName = 'CardTitle';

const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn(
        'text-sm text-muted-foreground',
        className
      )}
      {...props}
    />
  )
);
CardDescription.displayName = 'CardDescription';

const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('text-foreground', className)}
      {...props}
    />
  )
);
CardContent.displayName = 'CardContent';

const CardFooter = forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className, divider = false, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex items-center',
        divider && 'pt-4 border-t border-border mt-4',
        className
      )}
      {...props}
    />
  )
);
CardFooter.displayName = 'CardFooter';

// Stat Card for displaying statistics
export interface StatCardProps extends Omit<CardProps, 'children'> {
  title: string;
  value: string | number;
  description?: string;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  loading?: boolean;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  description,
  icon,
  trend,
  loading = false,
  className,
  ...props
}) => {
  if (loading) {
    return (
      <Card className={cn('animate-pulse', className)} {...props}>
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
          {icon && (
            <div className="h-12 w-12 bg-gray-200 dark:bg-gray-700 rounded-lg" />
          )}
        </div>
        {(description || trend) && (
          <div className="mt-4 flex items-center space-x-2">
            <div className="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        )}
      </Card>
    );
  }

  return (
    <Card className={className} {...props}>
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <CardDescription>{title}</CardDescription>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </div>
        </div>
        {icon && (
          <div className="flex-shrink-0 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
            {icon}
          </div>
        )}
      </div>
      
      {(description || trend) && (
        <div className="mt-4 flex items-center space-x-2 text-sm">
          {trend && (
            <span
              className={cn(
                'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
                trend.isPositive
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                  : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
              )}
            >
              {trend.isPositive ? '↗' : '↘'} {Math.abs(trend.value)}%
            </span>
          )}
          {description && (
            <span className="text-gray-600 dark:text-gray-400">
              {description}
            </span>
          )}
        </div>
      )}
    </Card>
  );
};

// Feature Card for showcasing features or services
export interface FeatureCardProps extends Omit<CardProps, 'children'> {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const FeatureCard: React.FC<FeatureCardProps> = ({
  icon,
  title,
  description,
  action,
  className,
  ...props
}) => {
  return (
    <Card className={cn('text-center hover:shadow-md transition-shadow', className)} {...props}>
      {icon && (
        <div className="flex justify-center mb-4">
          <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-full text-blue-600 dark:text-blue-400">
            {icon}
          </div>
        </div>
      )}
      <CardTitle className="mb-2">{title}</CardTitle>
      <CardDescription className="mb-4">{description}</CardDescription>
      {action && (
        <button
          onClick={action.onClick}
          className="inline-flex items-center text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 transition-colors"
        >
          {action.label}
          <svg className="ml-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
    </Card>
  );
};

// Profile Card for user profiles
export interface ProfileCardProps extends Omit<CardProps, 'children'> {
  avatar?: string;
  name: string;
  title?: string;
  description?: string;
  stats?: Array<{
    label: string;
    value: string | number;
  }>;
  actions?: React.ReactNode;
}

export const ProfileCard: React.FC<ProfileCardProps> = ({
  avatar,
  name,
  title,
  description,
  stats,
  actions,
  className,
  ...props
}) => {
  return (
    <Card className={cn('text-center', className)} {...props}>
      {/* Avatar */}
      <div className="flex justify-center mb-4">
        {avatar ? (
          <img
            src={avatar}
            alt={name}
            className="w-16 h-16 rounded-full object-cover"
          />
        ) : (
          <div className="w-16 h-16 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center">
            <span className="text-xl font-semibold text-gray-600 dark:text-gray-300">
              {name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>
      
      {/* Info */}
      <CardTitle className="mb-1">{name}</CardTitle>
      {title && <CardDescription className="mb-2">{title}</CardDescription>}
      {description && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{description}</p>
      )}
      
      {/* Stats */}
      {stats && stats.length > 0 && (
        <div className="flex justify-center divide-x divide-gray-200 dark:divide-gray-700 mb-4 py-4 border-t border-gray-200 dark:border-gray-700">
          {stats.map((stat, index) => (
            <div key={index} className="px-4 text-center first:pl-0 last:pr-0">
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</p>
            </div>
          ))}
        </div>
      )}
      
      {/* Actions */}
      {actions && (
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          {actions}
        </div>
      )}
    </Card>
  );
};

// Product Card for e-commerce
export interface ProductCardProps extends Omit<CardProps, 'children'> {
  image?: string;
  title: string;
  description?: string;
  price?: string;
  originalPrice?: string;
  badge?: string;
  rating?: number;
  onAddToCart?: () => void;
  onViewDetails?: () => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  image,
  title,
  description,
  price,
  originalPrice,
  badge,
  rating,
  onAddToCart,
  onViewDetails,
  className,
  ...props
}) => {
  return (
    <Card className={cn('overflow-hidden hover:shadow-lg transition-shadow', className)} padding="none" {...props}>
      {/* Image */}
      {image && (
        <div className="relative">
          <img
            src={image}
            alt={title}
            className="w-full h-48 object-cover"
          />
          {badge && (
            <div className="absolute top-2 left-2 bg-red-500 text-white px-2 py-1 rounded text-xs font-medium">
              {badge}
            </div>
          )}
        </div>
      )}
      
      {/* Content */}
      <div className="p-4">
        <CardTitle className="mb-1 text-base">{title}</CardTitle>
        {description && (
          <CardDescription className="mb-2 line-clamp-2">{description}</CardDescription>
        )}
        
        {/* Rating */}
        {rating && (
          <div className="flex items-center mb-2">
            {[...Array(5)].map((_, i) => (
              <span
                key={i}
                className={cn(
                  'text-sm',
                  i < rating ? 'text-yellow-400' : 'text-gray-300 dark:text-gray-600'
                )}
              >
                ★
              </span>
            ))}
            <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">({rating})</span>
          </div>
        )}
        
        {/* Price */}
        {price && (
          <div className="flex items-center space-x-2 mb-4">
            <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{price}</span>
            {originalPrice && (
              <span className="text-sm text-gray-500 dark:text-gray-400 line-through">
                {originalPrice}
              </span>
            )}
          </div>
        )}
        
        {/* Actions */}
        <div className="flex space-x-2">
          {onViewDetails && (
            <button
              onClick={onViewDetails}
              className="flex-1 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
            >
              View Details
            </button>
          )}
          {onAddToCart && (
            <button
              onClick={onAddToCart}
              className="flex-1 px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-md transition-colors"
            >
              Add to Cart
            </button>
          )}
        </div>
      </div>
    </Card>
  );
};

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter }
