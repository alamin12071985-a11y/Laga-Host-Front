require('dotenv').config();
const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const cron = require('node-cron');

// --- APP INITIALIZATION ---
const app = express();
const PORT = process.env.PORT || 3000;

// ⚠️ URL কনফিগারেশন (আপনার রেন্ডার লিংক এখানে দিবেন)
const WEB_APP_URL = "https://laga-host-front.onrender.com"; 

// --- ADMIN & CHANNEL CONFIG ---
const ADMIN_CONFIG = {
    token: "8353228427:AAHcfw6T-ZArT4J8HUW1TbSa9Utor2RxlLY", 
    chatId: "7605281774", // Admin Telegram ID
    channels: [
        { name: 'Laga Tech Official', username: '@lagatechofficial', url: 'https://t.me/lagatechofficial' },
        { name: 'Snowman Adventure', username: '@snowmanadventureannouncement', url: 'https://t.me/snowmanadventureannouncement' }
    ]
};

// --- MONGODB CONNECTION ---
const MONGO_URI = "mongodb+srv://lagahost:l%40g%40ho%24t@snowmanadventure.ocodku0.mongodb.net/snowmanadventure?retryWrites=true&w=majority&appName=snowmanadventure";

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected Successfully'))
    .catch(err => console.error('❌ DB Connection Error:', err.message));

// --- DATA MODELS (SCHEMAS) ---

// User Model
const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    username: String,
    firstName: String,
    plan: { type: String, default: 'Free' },
    botLimit: { type: Number, default: 1 },
    referrals: { type: Number, default: 0 },
    referredBy: String,
    planExpiresAt: { type: Date, default: null }, 
    joinedAt: { type: Date, default: Date.now }
});
const UserModel = mongoose.model('User', userSchema);

// Bot Instance Model
const botSchema = new mongoose.Schema({
    ownerId: { type: String, required: true },
    name: String,
    token: String,
    status: { type: String, default: 'STOPPED' }, 
    commands: { type: Object, default: {} }, // Stores custom JS codes
    isFirstLive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});
const BotModel = mongoose.model('Bot', botSchema);

// --- GLOBAL VARIABLES ---
let activeBotInstances = {}; // RAM Storage for running bots
const mainBot = new Telegraf(ADMIN_CONFIG.token);

// --- HELPER FUNCTIONS ---

// Check if user joined channels
async function checkSubscription(userId, telegram) {
    for (const channel of ADMIN_CONFIG.channels) {
        try {
            const member = await telegram.getChatMember(channel.username, userId);
            if (['left', 'kicked', 'restricted'].includes(member.status)) {
                return false;
            }
        } catch (e) {
            console.log(`⚠️ Skipping check for ${channel.username} (Bot might not be admin)`);
        }
    }
    return true;
}

// Cron Job: Runs every midnight to expire plans
cron.schedule('0 0 * * *', async () => {
    console.log('🔄 Running Cron Job: Checking Expired Plans...');
    const now = new Date();
    const expiredUsers = await UserModel.find({ 
        plan: { $ne: 'Free' }, 
        planExpiresAt: { $lt: now } 
    });
    
    for (const user of expiredUsers) {
        // Downgrade User
        user.plan = 'Free';
        user.botLimit = 1;
        user.planExpiresAt = null;
        await user.save();
        
        // Stop extra bots if they exceed limit
        const bots = await BotModel.find({ ownerId: user.userId });
        if(bots.length > 1) {
            for(let i=1; i<bots.length; i++) {
                const bId = bots[i]._id.toString();
                if(activeBotInstances[bId]) {
                    try { activeBotInstances[bId].stop(); } catch(e){}
                    delete activeBotInstances[bId];
                }
                bots[i].status = 'STOPPED';
                await bots[i].save();
            }
        }

        // Notify User
        try {
            await mainBot.telegram.sendMessage(user.userId, '⚠️ <b>Plan Expired</b>\nYou have been downgraded to Free plan.', { parse_mode: 'HTML' });
        } catch(e){}
    }
});

// --- MAIN BOT COMMANDS ---

mainBot.command('start', async (ctx) => {
    const args = ctx.message.text.split(' ');
    const referrerId = args[1];

    // Check or Create User
    let user = await UserModel.findOne({ userId: ctx.from.id.toString() });
    if (!user) {
        user = await UserModel.create({
            userId: ctx.from.id.toString(),
            username: ctx.from.username,
            firstName: ctx.from.first_name,
            referredBy: referrerId && referrerId !== ctx.from.id.toString() ? referrerId : null
        });

        // Handle Referral
        if (user.referredBy) {
            await UserModel.findOneAndUpdate({ userId: user.referredBy }, { $inc: { referrals: 1 } });
            try { 
                await ctx.telegram.sendMessage(user.referredBy, `🎉 <b>New Referral!</b>\n${ctx.from.first_name} joined via your link.`, {parse_mode: 'HTML'}); 
            } catch(e){}
        }
    }

    // Prepare Buttons
    const buttons = ADMIN_CONFIG.channels.map(ch => [Markup.button.url(`📢 Join ${ch.name}`, ch.url)]);
    buttons.push([Markup.button.webApp('🚀 Open Dashboard', WEB_APP_URL)]);

    await ctx.replyWithHTML(
        `👋 <b>Welcome to Laga Host!</b>\n\n` +
        `The Ultimate Telegram Bot Hosting Platform.\n` +
        `Deploy, Manage & Code your bots directly from Telegram.\n\n` +
        `👇 <b>Join channels & Click below to Start:</b>`,
        Markup.inlineKeyboard(buttons)
    );
});

// --- SERVER MIDDLEWARE ---
app.use(cors());
app.use(bodyParser.json({limit: '50mb'}));
app.use(express.static(path.join(__dirname, 'public')));

// --- BOT ENGINE CORE ---
// This function starts a user's bot safely
async function startBotEngine(botDoc) {
    const botId = botDoc._id.toString();

    // Prevent double starting
    if (activeBotInstances[botId]) {
        return { success: true, message: 'Bot is already running' };
    }

    try {
        const bot = new Telegraf(botDoc.token);
        
        // Error Handler to prevent server crash
        bot.catch((err, ctx) => {
            console.error(`❌ Bot Error [${botDoc.name}]:`, err);
        });

        // First Time Live Message
        if (botDoc.isFirstLive) {
            botDoc.isFirstLive = false;
            await botDoc.save();
        }

        // --- DYNAMIC COMMAND HANDLER (JS EDITOR LOGIC) ---
        bot.on('message', async (ctx) => {
            if (!ctx.message.text) return;
            const text = ctx.message.text;
            
            if (text.startsWith('/')) {
                const cmdName = text.substring(1).split(' ')[0]; // Extract command name
                
                // Fetch latest code from DB (Real-time update)
                const freshBot = await BotModel.findById(botId);
                const code = freshBot?.commands?.[cmdName];
                
                if (code) {
                    try {
                        // Execute User Code Safely
                        const func = new Function('ctx', 'bot', `
                            try {
                                ${code}
                            } catch(e) {
                                ctx.reply('⚠️ Script Error: ' + e.message);
                            }
                        `);
                        func(ctx, bot);
                    } catch (e) {
                        ctx.reply(`❌ Syntax Error in Command: ${e.message}`);
                    }
                }
            }
        });

        // Launch the instance
        await bot.launch({ dropPendingUpdates: true });
        activeBotInstances[botId] = bot;
        console.log(`✅ Started Bot: ${botDoc.name}`);
        return { success: true };

    } catch (e) {
        console.error(`❌ Failed to start [${botDoc.name}]:`, e.message);
        return { success: false, message: 'Invalid Token or Telegram API Error' };
    }
}

// --- API ROUTES (FRONTEND CONNECTION) ---

// 1. Get User Data & Bots
app.post('/api/bots', async (req, res) => {
    const { userId, username, firstName } = req.body;
    if(!userId) return res.json({ bots: [], user: null });

    let user = await UserModel.findOne({ userId });
    
    // Create or Update User
    if (!user) {
        user = await UserModel.create({ userId, username, firstName });
    } else if(firstName && user.firstName !== firstName) {
        user.firstName = firstName;
        user.username = username;
        await user.save();
    }

    // Downgrade check on load
    if (user.plan !== 'Free' && user.planExpiresAt && new Date() > new Date(user.planExpiresAt)) {
        user.plan = 'Free';
        user.botLimit = 1;
        user.planExpiresAt = null;
        await user.save();
    }

    const bots = await BotModel.find({ ownerId: userId }).sort({ createdAt: -1 });
    res.json({ bots, user });
});

// 2. Create New Bot
app.post('/api/createBot', async (req, res) => {
    const { token, name, userId } = req.body;
    
    // Validation
    const user = await UserModel.findOne({ userId });
    const count = await BotModel.countDocuments({ ownerId: userId });
    
    if (count >= user.botLimit) {
        return res.json({ success: false, message: `Limit Reached! Upgrade to create more.` });
    }
    
    if(!token.includes(':')) {
        return res.json({ success: false, message: 'Invalid Bot Token Format' });
    }

    const existing = await BotModel.findOne({ token });
    if (existing) {
        return res.json({ success: false, message: 'Token is already in use by another user!' });
    }

    // Save
    const newBot = await BotModel.create({ ownerId: userId, name, token });
    res.json({ success: true, bot: newBot });
});

// 3. Start/Stop Bot
app.post('/api/toggleBot', async (req, res) => {
    const { botId, action } = req.body;
    const bot = await BotModel.findById(botId);
    
    if(!bot) return res.json({ success: false, message: 'Bot not found' });

    if (action === 'start') {
        const result = await startBotEngine(bot);
        if (result.success) {
            bot.status = 'RUNNING';
            await bot.save();
            res.json({ success: true });
        } else {
            res.json({ success: false, message: result.message });
        }
    } else {
        // Stop Logic
        if (activeBotInstances[botId]) {
            try {
                activeBotInstances[botId].stop();
            } catch(e) { console.error('Stop error:', e); }
            delete activeBotInstances[botId];
        }
        bot.status = 'STOPPED';
        await bot.save();
        res.json({ success: true });
    }
});

// 4. Delete Bot
app.post('/api/deleteBot', async (req, res) => {
    const { botId } = req.body;
    
    // Stop if running
    if (activeBotInstances[botId]) {
        try { activeBotInstances[botId].stop(); } catch(e){}
        delete activeBotInstances[botId];
    }
    
    await BotModel.findByIdAndDelete(botId);
    res.json({ success: true });
});

// 5. Get Commands (For Editor)
app.post('/api/getCommands', async (req, res) => {
    const bot = await BotModel.findById(req.body.botId);
    res.json(bot ? bot.commands : {});
});

// 6. Save Command
app.post('/api/saveCommand', async (req, res) => {
    const { botId, command, code } = req.body;
    const cleanCmd = command.replace('/', '').trim();
    
    await BotModel.findByIdAndUpdate(botId, { 
        $set: { [`commands.${cleanCmd}`]: code } 
    });
    res.json({ success: true });
});

// 7. Delete Command
app.post('/api/deleteCommand', async (req, res) => {
    const { botId, command } = req.body;
    await BotModel.findByIdAndUpdate(botId, { 
        $unset: { [`commands.${command}`]: "" } 
    });
    res.json({ success: true });
});

// 8. Payment Submission & Handling
app.post('/api/submit-payment', async (req, res) => {
    const { trxId, plan, amount, userId, user, method } = req.body;

    // A. Referral Payment Logic
    if (method === 'referral') {
        const dbUser = await UserModel.findOne({ userId });
        const required = plan === 'Pro' ? 50 : 80;
        
        if (dbUser.referrals < required) {
            return res.json({ success: false, message: `Insufficient Referrals! Need ${required}.` });
        }
        
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 30);
        
        dbUser.plan = plan;
        dbUser.botLimit = plan === 'Pro' ? 5 : 10;
        dbUser.planExpiresAt = expiry;
        dbUser.referrals -= required;
        await dbUser.save();
        
        return res.json({ success: true, message: 'Plan Upgraded via Referrals! 🎉' });
    }

    // B. Manual Payment (Admin Verify)
    try {
        await mainBot.telegram.sendMessage(ADMIN_CONFIG.chatId, 
            `💰 <b>NEW PAYMENT RECEIVED</b>\n\n` +
            `👤 User: @${user} (<code>${userId}</code>)\n` +
            `💎 Plan: <b>${plan}</b>\n` +
            `💵 Amount: ${amount}৳\n` +
            `🧾 TrxID: <code>${trxId}</code>`,
            { 
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '✅ Approve', callback_data: `approve:${userId}:${plan}` }, 
                        { text: '❌ Decline', callback_data: `decline:${userId}` }
                    ]]
                }
            }
        );
        res.json({ success: true, message: 'Payment submitted for review!' });
    } catch(e) { 
        console.error('Admin Bot Error:', e);
        res.json({ success: false, message: 'Failed to notify admin.' }); 
    }
});

// 9. Admin Broadcast API
app.post('/api/broadcast', async (req, res) => {
    const { message, adminId } = req.body;
    if (adminId !== ADMIN_CONFIG.chatId) return res.json({ success: false, message: 'Forbidden' });

    const users = await UserModel.find({});
    let count = 0;
    
    users.forEach((u, i) => {
        setTimeout(async () => {
            try {
                await mainBot.telegram.sendMessage(u.userId, `📢 <b>Announcement</b>\n\n${message}`, { parse_mode: 'HTML' });
            } catch(e) {}
        }, i * 200); // Delay to prevent flood wait
        count++;
    });

    res.json({ success: true, total: count });
});

// --- ADMIN CALLBACKS (Button Clicks) ---
mainBot.action(/^approve:(\d+):(\w+)$/, async (ctx) => {
    const userId = ctx.match[1];
    const plan = ctx.match[2];
    const limits = { 'Pro': 5, 'VIP': 10 };
    
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 30);

    await UserModel.findOneAndUpdate(
        { userId }, 
        { plan, botLimit: limits[plan], planExpiresAt: expiry }
    );
    
    await ctx.editMessageText(`✅ Approved ${plan} for ID: ${userId}`);
    try { 
        await mainBot.telegram.sendMessage(userId, `✅ <b>Payment Accepted!</b>\n\nYou have been upgraded to <b>${plan}</b> plan.\nValidity: 30 Days.`, { parse_mode: 'HTML' }); 
    } catch(e){}
});

mainBot.action(/^decline:(\d+)$/, async (ctx) => {
    const userId = ctx.match[1];
    await ctx.editMessageText(`❌ Declined request for ID: ${userId}`);
    try { 
        await mainBot.telegram.sendMessage(userId, `❌ <b>Payment Declined</b>\nYour payment details were incorrect.`, { parse_mode: 'HTML' }); 
    } catch(e){}
});

// --- SAFE LAUNCH ---
mainBot.launch({ dropPendingUpdates: true })
    .then(() => console.log('🤖 Main Telegram Bot Started'))
    .catch((err) => console.error('❌ Main Bot Error:', err));

// --- RESTART HANDLER ---
// Restart all running bots if server restarts
mongoose.connection.once('open', async () => {
    console.log('🔄 Checking for active bots to restart...');
    const runningBots = await BotModel.find({ status: 'RUNNING' });
    if(runningBots.length > 0) {
        console.log(`🚀 Restarting ${runningBots.length} bots...`);
        for (const bot of runningBots) {
            await startBotEngine(bot);
        }
    }
});

// Graceful Shutdown
process.once('SIGINT', () => mainBot.stop('SIGINT'));
process.once('SIGTERM', () => mainBot.stop('SIGTERM'));

// Serve Frontend
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
