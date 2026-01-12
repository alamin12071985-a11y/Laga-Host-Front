require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

// --- CONFIGURATION ---
const ADMIN_CONFIG = {
    token: "8353228427:AAHcfw6T-ZArT4J8HUW1TbSa9Utor2RxlLY", 
    chatId: "7605281774"
};

const MONGO_URI = "mongodb+srv://lagahost:l%40g%40ho%24t@snowmanadventure.ocodku0.mongodb.net/snowmanadventure?retryWrites=true&w=majority&appName=snowmanadventure";

// --- DATABASE ---
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ DB Error:', err.message));

// --- SCHEMAS ---
const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    username: String,
    plan: { type: String, default: 'Free' },
    botLimit: { type: Number, default: 1 },
    joinedAt: { type: Date, default: Date.now }
});
const UserModel = mongoose.model('User', userSchema);

const botSchema = new mongoose.Schema({
    ownerId: { type: String, required: true },
    name: String,
    token: String,
    status: { type: String, default: 'STOPPED' },
    commands: { type: Object, default: {} },
    createdAt: { type: Date, default: Date.now }
});
const BotModel = mongoose.model('Bot', botSchema);

// Memory Storage
let activeBotInstances = {};

// --- ADMIN & APPROVAL ---
const adminBot = new Telegraf(ADMIN_CONFIG.token);

adminBot.action(/^approve:(\d+):(\w+)$/, async (ctx) => {
    const userId = ctx.match[1];
    const plan = ctx.match[2];
    const limits = { 'Free': 1, 'Pro': 5, 'VIP': 10 };
    
    try {
        await UserModel.findOneAndUpdate(
            { userId }, 
            { $set: { plan, botLimit: limits[plan] } },
            { upsert: true }
        );
        ctx.editMessageText(`✅ Approved: User ${userId} is now ${plan}`);
        try { await adminBot.telegram.sendMessage(userId, `🎉 Your plan is now: ${plan}`); } catch(e){}
    } catch(e) { console.log(e); }
});

adminBot.action(/^decline:(\d+)$/, async (ctx) => {
    ctx.editMessageText(`❌ Request Declined`);
});

adminBot.launch().catch(e => console.log("Admin bot error:", e.message));

// --- MIDDLEWARE ---
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- ⚡ IMPROVED BOT ENGINE (FIX 409) ---
async function startBotEngine(botDoc) {
    const botId = botDoc._id.toString();

    // 1. Force Stop if running in memory
    if (activeBotInstances[botId]) {
        try {
            console.log(`⚠️ Stopping existing instance for ${botDoc.name}`);
            activeBotInstances[botId].stop();
        } catch (e) { console.log("Stop error:", e.message); }
        delete activeBotInstances[botId];
    }

    try {
        const bot = new Telegraf(botDoc.token);

        // 2. Clear previous webhooks (Critical for 409 Fix)
        try { 
            await bot.telegram.deleteWebhook({ drop_pending_updates: true });
        } catch (e) {
            // Ignore if webhook wasn't set, but log other errors
            if(!e.message.includes('Not Found')) console.log('Webhook clear warning:', e.message);
        }

        // 3. Error Handler
        bot.catch((err) => {
            console.log(`[Bot Error] ${botDoc.name}:`, err.message);
            if (err.code === 409) {
                console.log(`Conflict detected for ${botDoc.name}. Another instance is running.`);
            }
        });

        // 4. Command Logic
        bot.on('message', async (ctx) => {
            if (!ctx.message.text) return;
            const text = ctx.message.text;
            
            if (text.startsWith('/')) {
                const cmdName = text.substring(1).split(' ')[0];
                const freshData = await BotModel.findById(botId); // Always fetch fresh
                const code = freshData?.commands?.[cmdName];
                
                if (code) {
                    try {
                        const func = new Function('ctx', code);
                        func(ctx);
                    } catch (e) { ctx.reply(`❌ Code Error: ${e.message}`); }
                }
            }
        });

        // 5. Launch with Retry Logic
        await bot.launch({ dropPendingUpdates: true });
        
        activeBotInstances[botId] = bot;
        console.log(`🚀 Started: ${botDoc.name}`);
        return { success: true };

    } catch (e) {
        console.error(`❌ Launch Failed (${botDoc.name}):`, e.message);
        
        // Handle Invalid Token
        if (e.code === 401 || e.message.includes('Unauthorized')) {
            await BotModel.findByIdAndUpdate(botId, { status: 'STOPPED' });
            return { success: false, message: 'Invalid Bot Token' };
        }
        // Handle 409 Conflict specifically
        if (e.code === 409 || e.description?.includes('conflict')) {
             return { success: false, message: 'Conflict: Bot is already running elsewhere! Close other instances.' };
        }

        return { success: false, message: e.message };
    }
}

// Restore running bots
mongoose.connection.once('open', async () => {
    // Wait a bit for connections to clear
    setTimeout(async () => {
        const runningBots = await BotModel.find({ status: 'RUNNING' });
        console.log(`🔄 Restarting ${runningBots.length} bots...`);
        for (const bot of runningBots) await startBotEngine(bot);
    }, 3000);
});

// --- API ROUTES ---

app.get('/api/bots', async (req, res) => {
    const { userId, username } = req.query;
    if(!userId) return res.json([]);

    await UserModel.findOneAndUpdate(
        { userId },
        { $setOnInsert: { username, plan: 'Free', botLimit: 1 } },
        { upsert: true }
    );

    const bots = await BotModel.find({ ownerId: userId }).sort({ createdAt: -1 });
    res.json(bots);
});

app.post('/api/createBot', async (req, res) => {
    const { token, name, userId } = req.body;
    
    // Validate Duplicate Token
    const existing = await BotModel.findOne({ token });
    if(existing) return res.json({ success: false, message: 'Token already used!' });

    // Validate Limit
    const user = await UserModel.findOne({ userId });
    const count = await BotModel.countDocuments({ ownerId: userId });
    
    if (count >= user.botLimit) {
        return res.json({ success: false, message: `Upgrade Plan! Limit: ${user.botLimit}` });
    }

    try {
        const newBot = await BotModel.create({ ownerId: userId, name, token, status: 'STOPPED' });
        res.json({ success: true, bot: newBot });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

app.post('/api/toggleBot', async (req, res) => {
    const { botId, action } = req.body;
    const bot = await BotModel.findById(botId);
    if (!bot) return res.json({ success: false, message: 'Bot not found' });

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
            activeBotInstances[botId].stop();
            delete activeBotInstances[botId];
        }
        bot.status = 'STOPPED';
        await bot.save();
        res.json({ success: true });
    }
});

app.post('/api/getCommands', async (req, res) => {
    const bot = await BotModel.findById(req.body.botId);
    res.json(bot ? bot.commands : {});
});

app.post('/api/saveCommand', async (req, res) => {
    const { botId, command, code } = req.body;
    const clean = command.replace('/', '').trim();
    await BotModel.findByIdAndUpdate(botId, { $set: { [`commands.${clean}`]: code } });
    res.json({ success: true });
});

app.post('/api/deleteCommand', async (req, res) => {
    const { botId, command } = req.body;
    await BotModel.findByIdAndUpdate(botId, { $unset: { [`commands.${command}`]: "" } });
    res.json({ success: true });
});

app.post('/api/deleteBot', async (req, res) => {
    const { botId } = req.body;
    if (activeBotInstances[botId]) {
        activeBotInstances[botId].stop();
        delete activeBotInstances[botId];
    }
    await BotModel.findByIdAndDelete(botId);
    res.json({ success: true });
});

app.post('/api/submit-payment', async (req, res) => {
    const { trxId, plan, amount, user, userId } = req.body;
    try {
        await adminBot.telegram.sendMessage(ADMIN_CONFIG.chatId, 
            `💰 <b>Payment</b>\nUser: @${user} (${userId})\nPlan: ${plan}\nTk: ${amount}\nTrxID: <code>${trxId}</code>`,
            { 
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[{ text: '✅ Approve', callback_data: `approve:${userId}:${plan}` }, { text: '❌ Decline', callback_data: `decline:${userId}` }]]
                }
            }
        );
        res.json({ success: true });
    } catch(e) { res.json({ success: false, message: 'Admin Error' }); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
