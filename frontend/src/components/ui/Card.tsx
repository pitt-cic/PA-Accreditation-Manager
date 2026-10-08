import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: CardProps) {
  return <div className={`bg-white rounded-2xl shadow-lg p-6 sm:p-8 ${className}`}>{children}</div>;
}
