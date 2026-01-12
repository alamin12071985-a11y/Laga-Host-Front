import React from 'react';
import { motion } from 'framer-motion';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hoverEffect?: boolean;
}

export const GlassCard: React.FC<GlassCardProps> = ({ 
  children, 
  className = "", 
  onClick,
  hoverEffect = false
}) => {
  return (
    <motion.div
      whileHover={hoverEffect ? { 
        y: -4,
        scale: 1.01,
        boxShadow: "0 20px 40px -10px rgba(99, 102, 241, 0.2)"
      } : {}}
      whileTap={hoverEffect ? { scale: 0.98 } : {}}
      onClick={onClick}
      className={`
        relative overflow-hidden rounded-2xl 
        border border-glass-border 
        bg-glass-100 backdrop-blur-xl 
        shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] 
        transition-colors duration-300
        group
        ${className}
      `}
    >
      {/* Noise texture for premium feel */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay bg-[url('https://grainy-gradients.vercel.app/noise.svg')]"></div>
      
      {/* Subtle Gradient Overlay on Hover */}
      {hoverEffect && (
        <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
      )}

      <div className="relative z-10">
        {children}
      </div>
    </motion.div>
  );
};
