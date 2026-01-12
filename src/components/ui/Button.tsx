import React from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  isLoading, 
  className = '',
  disabled,
  ...props 
}) => {
  const baseStyles = "relative px-6 py-3 rounded-xl font-medium transition-all duration-300 flex items-center justify-center gap-2 overflow-hidden group disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variants = {
    primary: "bg-gradient-to-r from-brand-primary to-brand-secondary text-white shadow-lg shadow-brand-primary/20 hover:shadow-brand-primary/40 border border-white/10",
    secondary: "bg-white/5 hover:bg-white/10 text-white border border-white/10 backdrop-blur-md",
    danger: "bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/30",
  };

  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      disabled={disabled || isLoading}
      className={`${baseStyles} ${variants[variant]} ${className}`}
      {...props}
    >
      {isLoading ? (
        <>
          <Loader2 className="animate-spin -ml-1 h-5 w-5 text-white" />
          <span>Processing...</span>
        </>
      ) : (
        <>
           {variant === 'primary' && (
            <div className="absolute inset-0 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent z-0" />
           )}
           <span className="relative z-10 flex items-center gap-2">{children}</span>
        </>
      )}
    </motion.button>
  );
};
