import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot as BotIcon, Zap, Server, Plus } from 'lucide-react';

import { Bot, Plan, ModalType, Command } from './types';
import { PLANS, CURRENCY } from './constants';
import { LoadingScreen } from './components/LoadingScreen';
import { GlassCard } from './components/ui/GlassCard';
import { Button } from './components/ui/Button';
import { CreateBotModal } from './components/modals/CreateBotModal';
import { PaymentModal } from './components/modals/PaymentModal';
import { ConfirmationModal } from './components/modals/ConfirmationModal';
import { BotUsersModal } from './components/modals/BotUsersModal';
import { BotCommandsModal } from './components/modals/BotCommandsModal';
import { BotSettingsModal } from './components/modals/BotSettingsModal';
import { BotCard } from './components/BotCard';

function App() {
  const [loading, setLoading] = useState(true);
  const [bots, setBots] = useState<Bot[]>([]);
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [showCreateConfirm, setShowCreateConfirm] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const [activeBotId, setActiveBotId] = useState<string | null>(null);
  const [telegramUser, setTelegramUser] = useState<{photo_url?: string, first_name?: string} | null>(null);

  useEffect(() => {
    if (window.Telegram && window.Telegram.WebApp) {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
      const user = window.Telegram.WebApp.initDataUnsafe?.user;
      if (user) setTelegramUser(user);
    }
    const timer = setTimeout(() => setLoading(false), 2500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleBotAction = (action: 'users' | 'commands' | 'settings', bot: Bot) => {
    setActiveBotId(bot.id);
    if (action === 'users') setActiveModal('botUsers');
    if (action === 'commands') setActiveModal('botCommands');
    if (action === 'settings') setActiveModal('botSettings');
  };

  const processPayment = async (trxId: string) => {
    // Simulate API Call
    await new Promise(resolve => setTimeout(resolve, 1500));
    setNotification({ message: 'Request Sent! Admin will approve shortly.', type: 'success' });
    setActiveModal(null);
    setSelectedPlan(null);
  };

  const getActiveBot = () => bots.find(b => b.id === activeBotId);

  return (
    <div className="min-h-screen relative text-white font-sans selection:bg-brand-primary/30">
      <div className="fixed inset-0 pointer-events-none z-0">
         <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-brand-primary/20 rounded-full blur-[120px] opacity-40"></div>
         <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-brand-secondary/20 rounded-full blur-[120px] opacity-40"></div>
      </div>

      <AnimatePresence>
        {loading && <LoadingScreen />}
      </AnimatePresence>

      {!loading && (
        <motion.main 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 max-w-lg mx-auto p-5 pb-20"
        >
          <header className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-brand-primary/20 rounded-lg border border-brand-primary/30">
                <Server size={24} className="text-brand-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-300">Laga Host</h1>
                <p className="text-xs text-gray-400">Status: <span className="text-green-400">Operational</span></p>
              </div>
            </div>
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-brand-primary to-brand-secondary border border-white/20 overflow-hidden shadow-lg">
               {telegramUser?.photo_url ? (
                 <img src={telegramUser.photo_url} alt="Profile" className="w-full h-full object-cover" />
               ) : (
                 <div className="w-full h-full flex items-center justify-center font-bold text-sm bg-white/10 backdrop-blur-sm">
                    {telegramUser?.first_name ? telegramUser.first_name.charAt(0) : 'U'}
                 </div>
               )}
            </div>
          </header>

          <AnimatePresence>
            {notification && (
              <motion.div 
                initial={{ opacity: 0, y: -20, x: "-50%" }} 
                animate={{ opacity: 1, y: 0, x: "-50%" }}
                exit={{ opacity: 0, y: -20, x: "-50%" }}
                className="fixed top-6 left-1/2 z-[60] px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 shadow-xl text-sm font-medium flex items-center gap-2 whitespace-nowrap"
              >
                <div className={`w-2 h-2 rounded-full ${notification.type === 'success' ? 'bg-green-400' : 'bg-red-400'}`} />
                {notification.message}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-10">
            <section>
              <h2 className="text-lg font-semibold tracking-wide mb-4">My Bots</h2>
              {bots.length === 0 ? (
                <GlassCard className="py-12 flex flex-col items-center justify-center text-center group">
                  <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 shadow-[0_0_30px_rgba(255,255,255,0.05)]">
                    <BotIcon size={32} className="text-gray-400 group-hover:text-white transition-colors" />
                  </div>
                  <h3 className="text-lg font-medium text-white mb-2">No Bots Deployed</h3>
                  <Button onClick={() => setShowCreateConfirm(true)} className="shadow-[0_0_20px_rgba(99,102,241,0.3)]">
                    <Zap size={18} fill="currentColor" /> Create Your First Bot
                  </Button>
                </GlassCard>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-4">
                    {bots.map((bot) => (
                      <BotCard 
                        key={bot.id} 
                        bot={bot} 
                        onToggleStatus={(id) => setBots(bots.map(b => b.id === id ? {...b, status: b.status === 'Running' ? 'Stopped' : 'Running'} : b))}
                        onAction={handleBotAction}
                      />
                    ))}
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.01, backgroundColor: 'rgba(255, 255, 255, 0.08)' }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowCreateConfirm(true)}
                    className="w-full py-4 rounded-2xl border border-dashed border-white/20 bg-white/5 flex items-center justify-center gap-3 text-gray-400 hover:text-white hover:border-brand-primary/50 transition-all group"
                  >
                    <Plus size={20} /> Deploy Another Bot
                  </motion.button>
                </div>
              )}
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-4 tracking-wide">Choose Plan</h2>
              <div className="space-y-4">
                {PLANS.map((plan) => (
                  <GlassCard 
                    key={plan.id} 
                    className={`relative p-5 ${plan.isBestValue ? 'border-brand-secondary/40 bg-brand-secondary/5' : ''}`}
                  >
                    {plan.isBestValue && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-brand-secondary to-pink-500 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow-lg">
                        Best Value
                      </div>
                    )}
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-bold text-white text-lg">{plan.name}</h3>
                        <div className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 mt-1">
                          {plan.price === 0 ? 'Free' : `${CURRENCY}${plan.price}`} <span className="text-xs text-gray-500 font-normal">/mo</span>
                        </div>
                      </div>
                      <div className="text-sm font-medium text-brand-accent mb-1">{plan.botLimit} Bots</div>
                    </div>
                    <Button 
                      variant={plan.price === 0 ? 'secondary' : 'primary'} 
                      className="w-full h-10 text-sm"
                      onClick={() => {
                         if(plan.price > 0) { setSelectedPlan(plan); setActiveModal('payment'); }
                      }}
                      disabled={plan.price === 0}
                    >
                      {plan.price === 0 ? 'Current Plan' : 'Upgrade Now'}
                    </Button>
                  </GlassCard>
                ))}
              </div>
            </section>
          </div>
        </motion.main>
      )}

      {/* Modals */}
      <AnimatePresence>
        {showCreateConfirm && (
          <ConfirmationModal 
            isOpen={showCreateConfirm}
            title="Create New Bot?"
            message="Are you sure you want to initialize a new bot?"
            onConfirm={() => { setShowCreateConfirm(false); setActiveModal('createBot'); }}
            onCancel={() => setShowCreateConfirm(false)}
          />
        )}
        {activeModal === 'createBot' && (
          <CreateBotModal 
            onClose={() => setActiveModal(null)} 
            onSave={(name, token) => {
              setBots([...bots, { id: Date.now().toString(), name, token, status: 'Running', createdAt: Date.now(), commands: [] }]);
              setActiveModal(null);
              setNotification({ message: 'Bot successfully created!', type: 'success' });
            }} 
          />
        )}
        {activeModal === 'botUsers' && getActiveBot() && <BotUsersModal bot={getActiveBot()!} onClose={() => setActiveModal(null)} />}
        {activeModal === 'botCommands' && getActiveBot() && (
          <BotCommandsModal 
            bot={getActiveBot()!}
            onClose={() => setActiveModal(null)}
            onUpdateCommands={(botId, commands) => {
               setBots(bots.map(b => b.id === botId ? { ...b, commands } : b));
               setNotification({ message: 'Commands updated!', type: 'success' });
            }}
          />
        )}
        {activeModal === 'botSettings' && getActiveBot() && (
          <BotSettingsModal 
            bot={getActiveBot()!}
            onClose={() => setActiveModal(null)}
            onUpdateBot={(botId, data) => {
               setBots(bots.map(b => b.id === botId ? { ...b, ...data } : b));
               setNotification({ message: 'Bot settings saved!', type: 'success' });
            }}
          />
        )}
        {activeModal === 'payment' && selectedPlan && (
          <PaymentModal 
            plan={selectedPlan}
            onClose={() => { setActiveModal(null); setSelectedPlan(null); }}
            onSubmit={processPayment}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
