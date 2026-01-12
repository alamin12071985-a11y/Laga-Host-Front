export interface Command {
  id: string;
  command: string;
  code: string;
}

export interface BotUser {
  id: number;
  firstName: string;
  username?: string;
  joinedAt: string;
}

export interface Bot {
  id: string;
  name: string;
  token: string;
  status: 'Running' | 'Stopped';
  createdAt: number;
  commands: Command[];
}

export interface Plan {
  id: string;
  name: string;
  price: number;
  botLimit: number;
  features: string[];
  isBestValue?: boolean;
}

export type ModalType = 'createBot' | 'payment' | 'botUsers' | 'botCommands' | 'botSettings' | null;

declare global {
  interface Window {
    Telegram: any;
  }
}
