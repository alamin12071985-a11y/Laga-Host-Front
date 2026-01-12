import React, { useState } from 'react';
import { Copy, Check, CreditCard, X } from 'lucide-react';
import { GlassCard } from '../ui/GlassCard';
import { Button } from '../ui/Button';
import { ADMIN_PHONE, CURRENCY } from '../../constants';
import { Plan } from '../../types';

interface PaymentModalProps {
  plan: Plan;
  onClose: () => void;
  onSubmit: (trxId: string) => Promise<void>;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({ plan, onClose, onSubmit }) => {
  const [trxId, setTrxId] = useState('');
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleCopy = () => {
    navigator.clipboard.writeText(ADMIN_PHONE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async () => {
    if (!trxId.trim()) {
      setError('Please enter the Transaction ID');
      return;
    }
    
    setIsSubmitting(true);
    setError('');
    
    try {
      await onSubmit(trxId);
    } catch (err) {
      setError('Failed to submit. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md z-10">
        <GlassCard className="border-brand-secondary/30 shadow-brand-secondary/10">
          <div className="flex justify-between items-center mb-6">
             <div>
                <h2 className="text-xl font-bold text-white">Upgrade to {plan.name}</h2>
                <p className="text-sm text-gray-400">Total: {CURRENCY}{plan.price}</p>
             </div>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <X size={20} className="text-gray-300" />
            </button>
          </div>

          <div className="space-y-6">
            <div className="bg-brand-secondary/10 border border-brand-secondary/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                 <CreditCard size={18} className="text-brand-secondary" />
                 <span className="font-semibold text-brand-secondary">Nagad Personal</span>
              </div>
              
              <div className="flex items-center justify-between bg-black/30 rounded-lg p-3 border border-white/5">
                <span className="font-mono text-lg tracking-wider">{ADMIN_PHONE}</span>
                <button onClick={handleCopy} className="p-2 hover:bg-white/10 rounded-md transition-colors text-gray-400 hover:text-white">
                  {copied ? <Check size={18} className="text-green-400" /> : <Copy size={18} />}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Send <b>{CURRENCY}{plan.price}</b> using "Send Money" option.
              </p>
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1">Transaction ID (TrxID)</label>
              <input
                type="text"
                value={trxId}
                onChange={(e) => setTrxId(e.target.value)}
                placeholder="7XG29..."
                className="w-full bg-black/20 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-gray-600 focus:outline-none focus:border-brand-secondary/50 focus:ring-1 focus:ring-brand-secondary/50 transition-all font-mono"
              />
              {error && <p className="text-red-400 text-sm mt-1">{error}</p>}
            </div>

            <Button 
              onClick={handleSubmit} 
              className="w-full bg-gradient-to-r from-brand-secondary to-pink-600"
              isLoading={isSubmitting}
            >
              Confirm Payment
            </Button>
          </div>
        </GlassCard>
      </div>
    </div>
  );
};
