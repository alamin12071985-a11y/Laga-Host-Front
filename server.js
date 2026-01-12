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

// --- DATABASE CONNECTION ---
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
    commands: { type: Object, default: {} }, // { '/start': 'ctx.reply("Hi")' }
    createdAt: { type: Date, default: Date.now }
});
const BotModel = mongoose.model('Bot', botSchema);

// Active Bots Memory
let activeBotInstances = {};

// --- ADMIN SYSTEM ---
const adminBot = new Telegraf(ADMIN_CONFIG.token);

// Approve Action
adminBot.action(/^approve:(\d+):(\w+)$/, async (ctx) => {
    const userId = ctx.match[1];
    const plan = ctx.match[2];
    const limits = { 'Free': 1, 'Pro': 5, 'VIP': 10 };
    const limit = limits[plan] || 1;

    try {
        await UserModel.findOneAndUpdate(
            { userId }, 
            { $set: { plan, botLimit: limit } },
            { upsert: true, new: true }
        );
        await ctx.editMessageText(`✅ Approved!\n👤 User: ${userId}\n💎 Plan: ${plan}\n🚀 Limit: ${limit}`);
        try { await adminBot.telegram.sendMessage(userId, `✅ Your plan updated to **${plan}**!`, { parse_mode: 'Markdown' }); } catch(e){}
    } catch (e) { ctx.answerCbQuery('DB Error'); }
});

// Decline Action
adminBot.action(/^decline:(\d+)$/, async (ctx) => {
    await ctx.editMessageText(`❌ Declined Request for User ${ctx.match[1]}`);
});
adminBot.launch();

// --- MIDDLEWARE ---
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- BOT ENGINE (FIXED) ---
async function startBotEngine(botDoc) {
    try {
        if (activeBotInstances[botDoc._id]) return { success: true, message: 'Already running' };

        const bot = new Telegraf(botDoc.token);

        // 1. Webhook Fix: Delete webhook before polling
        try { await bot.telegram.deleteWebhook(); } catch (e) { console.log('Webhook delete skipped'); }

        // 2. Error Handler
        bot.catch((err) => console.log(`[Bot ${botDoc.name}] Error:`, err));

        // 3. Dynamic Command Handler (Reads directly from DB for live updates)
        bot.on('message', async (ctx) => {
            if (!ctx.message.text) return;
            const text = ctx.message.text;
            
            if (text.startsWith('/')) {
                const cmdName = text.substring(1).split(' ')[0]; // e.g., 'start'
                
                // Fetch latest code from DB
                const freshBotData = await BotModel.findById(botDoc._id);
                if (!freshBotData || !freshBotData.commands) return;

                const code = freshBotData.commands[cmdName];
                if (code) {
                    try {
                        // Secure-ish execution
                        const func = new Function('ctx', code);
                        func(ctx);
                    } catch (e) {
                        ctx.reply(`⚠️ Command Error: ${e.message}`);
                    }
                }
            }
        });

        // 4. Launch
        await bot.launch();
        activeBotInstances[botDoc._id] = bot;
        console.log(`🚀 Started: ${botDoc.name}`);
        return { success: true };

    } catch (e) {
        console.error(`❌ Start Fail (${botDoc.name}):`, e.message);
        if (e.message.includes('401') || e.message.includes('Unauthorized')) {
            await BotModel.findByIdAndUpdate(botDoc._id, { status: 'STOPPED' });
            return { success: false, message: 'Invalid Bot Token! Check @BotFather.' };
        }
        return { success: false, message: e.message };
    }
}

// Restore on Restart
mongoose.connection.once('open', async () => {
    const runningBots = await BotModel.find({ status: 'RUNNING' });
    console.log(`🔄 Restoring ${runningBots.length} bots...`);
    for (const bot of runningBots) await startBotEngine(bot);
});

// --- API ROUTES ---

// 1. Get Bots & Create User if missing
app.get('/api/bots', async (req, res) => {
    const { userId, username } = req.query;
    if (!userId) return res.json([]);

    // Sync User
    await UserModel.findOneAndUpdate(
        { userId }, 
        { $setOnInsert: { username, plan: 'Free', botLimit: 1 } },
        { upsert: true }
    );
    
    const bots = await BotModel.find({ ownerId: userId }).sort({ createdAt: -1 });
    res.json(bots);
});

// 2. Create Bot (Limit Check)
app.post('/api/createBot', async (req, res) => {
    const { token, name, userId } = req.body;
    
    // Check Limit
    const user = await UserModel.findOne({ userId });
    const currentBots = await BotModel.countDocuments({ ownerId: userId });
    
    if (currentBots >= user.botLimit) {
        return res.json({ success: false, message: `Plan Limit Reached! (${user.botLimit} Max)` });
    }

    try {
        const newBot = await BotModel.create({ ownerId: userId, name, token, status: 'STOPPED' });
        res.json({ success: true, bot: newBot });
    } catch (e) { res.json({ success: false, message: e.message }); }
});

// 3. Toggle Bot
app.post('/api/toggleBot', async (req, res) => {
    const { botId, action } = req.body;
    const botDoc = await BotModel.findById(botId);
    
    if (action === 'start') {
        const result = await startBotEngine(botDoc);
        if (result.success) {
            botDoc.status = 'RUNNING';
            await botDoc.save();
            res.json({ success: true });
        } else {
            res.json({ success: false, message: result.message });
        }
    } else {
        if (activeBotInstances[botId]) {
            activeBotInstances[botId].stop('Web Stop');
            delete activeBotInstances[botId];
        }
        botDoc.status = 'STOPPED';
        await botDoc.save();
        res.json({ success: true });
    }
});

// 4. Command Management
app.post('/api/getCommands', async (req, res) => {
    const bot = await BotModel.findById(req.body.botId);
    res.json(bot ? bot.commands : {});
});

app.post('/api/saveCommand', async (req, res) => {
    const { botId, command, code } = req.body;
    // Remove slash if user added it
    const cleanCmd = command.replace(/^\//, '').trim();
    
    await BotModel.findByIdAndUpdate(botId, {
        $set: { [`commands.${cleanCmd}`]: code }
    });
    res.json({ success: true });
});

app.post('/api/deleteCommand', async (req, res) => {
    const { botId, command } = req.body;
    await BotModel.findByIdAndUpdate(botId, {
        $unset: { [`commands.${command}`]: "" }
    });
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

// 5. Payment
app.post('/api/submit-payment', async (req, res) => {
    const { trxId, plan, amount, user, userId } = req.body;
    
    try {
        await adminBot.telegram.sendMessage(ADMIN_CONFIG.chatId, 
            `🔔 <b>New Payment Request</b>\n\n👤 User: @${user} (ID: ${userId})\n💎 Plan: <b>${plan}</b>\n💰 Amount: ${amount} BDT\n🧾 TrxID: <code>${trxId}</code>`, 
            { 
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Approve', callback_data: `approve:${userId}:${plan}` }],
                        [{ text: '❌ Decline', callback_data: `decline:${userId}` }]
                    ]
                }
            }
        );
        res.json({ success: true });
    } catch (e) { res.json({ success: false, message: 'Admin bot error' }); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
