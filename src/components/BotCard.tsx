import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot as BotIcon, Users, Terminal, Settings, Copy, Check } from 'lucide-react';
import { GlassCard } from './ui/GlassCard';
import { Bot } from '../types';

interface BotCardProps {
  bot: Bot;
  onToggleStatus: (id: string) => void;
  onAction: (action: 'users' | 'commands' | 'settings', bot: Bot) => void;
}

export const BotCard: React.FC<BotCardProps> = ({ bot, onToggleStatus, onAction }) => {
  const [copied, setCopied] = useState(false);
  const isRunning = bot.status === 'Running';

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(bot.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const maskedToken = `${bot.token.substring(0, 6)}...${bot.token.substring(bot.token.length - 4)}`;

  return (
    <div className="relative">
      <AnimatePresence>
        <motion.div
          key={bot.status}
          initial={{ opacity: 0.6 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
          className={`absolute -inset-[1px] rounded-2xl pointer-events-none z-0 ${
            isRunning ? 'bg-green-500 blur-md' : 'bg-red-500 blur-md'
          }`}
        />
      </AnimatePresence>

      <GlassCard hoverEffect className="p-4 z-10 bg-glass-200">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`
              w-12 h-12 rounded-xl flex items-center justify-center border border-white/10
              transition-colors duration-500
              ${isRunning ? 'bg-gradient-to-br from-brand-primary/80 to-brand-secondary/80' : 'bg-gray-800'}
            `}>
              <BotIcon size={24} className="text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-lg">{bot.name}</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-mono text-gray-400 bg-black/20 px-2 py-0.5 rounded">
                  {maskedToken}
                </span>
                <button onClick={handleCopy} className="text-gray-500 hover:text-white transition-colors">
                  {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1">
             <div 
               onClick={() => onToggleStatus(bot.id)}
               className={`
                 relative w-12 h-6 rounded-full cursor-pointer transition-colors duration-300 border border-white/10
                 ${isRunning ? 'bg-green-500/20' : 'bg-red-500/20'}
               `}
             >
               <motion.div 
                 className={`absolute top-0.5 w-5 h-5 rounded-full shadow-md ${isRunning ? 'bg-green-500 left-[calc(100%-1.35rem)]' : 'bg-red-500 left-0.5'}`}
                 layout
                 transition={{ type: "spring", stiffness: 500, damping: 30 }}
               />
             </div>
             <span className={`text-[10px] font-medium ${isRunning ? 'text-green-400' : 'text-red-400'}`}>
               {bot.status}
             </span>
          </div>
        </div>
        
        <div className="grid grid-cols-3 gap-2 mt-4">
          {[
            { id: 'users', label: 'Users', icon: Users, color: 'text-blue-400' },
            { id: 'commands', label: 'Cmds', icon: Terminal, color: 'text-purple-400' },
            { id: 'settings', label: 'Settings', icon: Settings, color: 'text-gray-400' }
          ].map((action) => (
            <button 
              key={action.id}
              onClick={() => onAction(action.id as any, bot)}
              className="flex flex-col items-center justify-center py-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-colors border border-white/5 group"
            >
              <action.icon size={18} className={`${action.color} mb-1 group-hover:scale-110 transition-transform`} />
              <span className="text-[10px] text-gray-300">{action.label}</span>
            </button>
          ))}
        </div>
      </GlassCard>
    </div>
  );
};
