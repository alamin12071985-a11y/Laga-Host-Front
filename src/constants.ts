import { Plan } from './types';

export const ADMIN_PHONE = "01761494948";
export const CURRENCY = "৳";

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free Starter',
    price: 0,
    botLimit: 1,
    features: ['Basic Support', 'Standard Speed'],
  },
  {
    id: 'pro',
    name: 'Pro Host',
    price: 50,
    botLimit: 5,
    features: ['Priority Support', 'High Speed', '24/7 Uptime'],
  },
  {
    id: 'vip',
    name: 'VIP Elite',
    price: 80,
    botLimit: 10,
    features: ['Dedicated Resources', 'Instant Support', 'Custom Domain'],
    isBestValue: true,
  },
];
