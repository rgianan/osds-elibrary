import * as React from 'react';
import { cn } from '@/lib/utils';

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & { placeholder?: string };

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, placeholder, ...props }, ref) => (
    <select ref={ref} className={cn('pds-input', className)} {...props}>
      {placeholder ? <option value="">{placeholder}</option> : null}
      {children}
    </select>
  ),
);
Select.displayName = 'Select';
