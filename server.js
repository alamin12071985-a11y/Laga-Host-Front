require('dotenv').config();
const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const cron = require('node-cron');
const moment = require('moment');
const axios = require('axios'); // ✅ Added for OpenRouter API

// =================================================================================
// 1. SYSTEM CONFIGURATION & CONSTANTS
// =================================================================================

const app = express();
const PORT = process.env.PORT || 3000;

// ⚠️ Frontend URL (Must match your Render Frontend URL for CORS)
const WEB_APP_URL = process.env.WEB_APP_URL || "https://laga-host-front.onrender.com"; 

// 🤖 AI Configuration (OpenRouter)
// ✅ Updated API Key provided by you
const OPENROUTER_API_KEY = "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";

// 🛠️ Admin & Channel Config
// Using Environment variables with fallbacks
const ADMIN_CONFIG = {
    token: process.env.BOT_TOKEN || "8353228427:AAHcfw6T-ZArT4J8HUW1TbSa9Utor2RxlLY", // Main Bot Token
    chatId: process.env.ADMIN_ID || "7605281774", // Your Admin Telegram ID
    channels: [
        { name: 'Laga Tech Official', username: '@lagatechofficial', url: 'https://t.me/lagatechofficial' },
        { name: 'Snowman Adventure', username: '@snowmanadventureannouncement', url: 'https://t.me/snowmanadventureannouncement' }
    ]
};

// 🗄️ Database Connection String
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://lagahost:l%40g%40ho%24t@snowmanadventure.ocodku0.mongodb.net/snowmanadventure?retryWrites=true&w=majority&appName=snowmanadventure";

// =================================================================================
// 2. DATABASE CONNECTION & MODELS
// =================================================================================

// Connect to MongoDB with detailed event logging
mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('✅ [DB] MongoDB Connected Successfully');
        console.log('📊 [DB] Database is ready for read/write operations');
    })
    .catch(err => {
        console.error('❌ [DB] Connection Error:', err.message);
        console.error('❌ [DB] Please check your IP Whitelist in MongoDB Atlas or connection string.');
        process.exit(1); // Exit process if DB fails
    });

// --- SCHEMA DEFINITIONS ---

/**
 * USER MODEL: Stores platform user data, plans, and referrals
 */
const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    username: String,
    firstName: String,
    plan: { type: String, default: 'Free' }, // Plans: Free, Pro, VIP
    botLimit: { type: Number, default: 1 },  // Bot Creation Limit
    referrals: { type: Number, default: 0 }, // Reward Points
    referredBy: String,
    planExpiresAt: { type: Date, default: null }, 
    joinedAt: { type: Date, default: Date.now },
    lastActive: { type: Date, default: Date.now }
});
const UserModel = mongoose.model('User', userSchema);

/**
 * BOT MODEL: Stores hosted bot instances and their configuration
 */
const botSchema = new mongoose.Schema({
    ownerId: { type: String, required: true },
    name: String,
    token: String,
    status: { type: String, default: 'STOPPED' }, // RUNNING, STOPPED
    startedAt: { type: Date, default: null },     // For Uptime Calculation
    restartCount: { type: Number, default: 0 },
    commands: { type: Object, default: {} },      // Custom JS Commands storage
    isFirstLive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});
const BotModel = mongoose.model('Bot', botSchema);

/**
 * END USER MODEL: Stores users who chat with child bots (For Broadcast System)
 */
const endUserSchema = new mongoose.Schema({
    tgId: { type: String, required: true },
    botId: { type: String, required: true }, // Which bot they belong to
    username: String,
    firstName: String,
    createdAt: { type: Date, default: Date.now }
});
// Compound index to prevent duplicate user entries per bot
endUserSchema.index({ tgId: 1, botId: 1 }, { unique: true });
const EndUserModel = mongoose.model('EndUser', endUserSchema);


// =================================================================================
// 3. GLOBAL VARIABLES & MIDDLEWARE
// =================================================================================

// 🧠 RAM Storage for running bots (Vital for performance & management)
let activeBotInstances = {}; 

// Initialize Main Admin Bot
const mainBot = new Telegraf(ADMIN_CONFIG.token);

// Middleware Setup
app.use(cors()); // Enable CORS for Frontend
app.use(bodyParser.json({limit: '50mb'})); // Increased limit for large requests
app.use(express.static(path.join(__dirname, 'public'))); // Serve Static Files


// =================================================================================
// 4. CORE BOT ENGINE (THE HEART OF LAGA HOST)
// =================================================================================

/**
 * startBotEngine
 * This function initializes a child bot, sets up logic, middleware, and launches it.
 * 
 * @param {Object} botDoc - The database document of the bot
 * @returns {Object} { success: boolean, message: string }
 */
async function startBotEngine(botDoc) {
    const botId = botDoc._id.toString();

    // 1. Check if already running in RAM
    if (activeBotInstances[botId]) {
        return { success: true, message: 'Bot is already active.' };
    }

    try {
        // 2. Initialize Telegraf Instance
        const bot = new Telegraf(botDoc.token);

        // 🔥 CRITICAL FIX: Delete Webhook before starting to prevent 409 Conflict
        try {
            await bot.telegram.deleteWebhook();
        } catch (e) {
            // Ignore error if no webhook was set, but log it for debug
            // console.log(`[Webhook Info] ${botDoc.name}: No previous webhook to delete.`);
        }

        // 3. Validate Token
        const botInfo = await bot.telegram.getMe();

        // 4. Error Handling
        bot.catch((err, ctx) => {
            console.error(`⚠️ [Child Error] ${botDoc.name}:`, err.message);
        });

        // 5. First Time Setup Flag
        if (botDoc.isFirstLive) {
            botDoc.isFirstLive = false;
            await botDoc.save();
        }

        // ============================================================
        // MIDDLEWARE: CAPTURE END USERS (For Broadcast System)
        // ============================================================
        bot.use(async (ctx, next) => {
            if(ctx.from) {
                (async () => {
                    try {
                        const exists = await EndUserModel.exists({ 
                            tgId: ctx.from.id.toString(), 
                            botId: botId 
                        });
                        if (!exists) {
                            await EndUserModel.create({
                                tgId: ctx.from.id.toString(),
                                botId: botId,
                                username: ctx.from.username,
                                firstName: ctx.from.first_name
                            });
                        }
                    } catch(e) { }
                })();
            }
            return next();
        });

        // ============================================================
        // DYNAMIC JS COMMAND HANDLER
        // ============================================================
        bot.on('message', async (ctx) => {
            if (!ctx.message.text) return;
            const text = ctx.message.text;
            
            if (text.startsWith('/')) {
                const cmdName = text.substring(1).split(' ')[0];
                const freshBot = await BotModel.findById(botId);
                const code = freshBot?.commands?.[cmdName];
                
                if (code) {
                    try {
                        // 🔒 SANDBOX EXECUTION
                        const func = new Function('ctx', 'bot', 'Markup', `
                            try {
                                ${code}
                            } catch(e) {
                                ctx.reply('⚠️ Code Error: ' + e.message);
                            }
                        `);
                        func(ctx, bot, Markup);
                    } catch (e) {
                        ctx.reply(`❌ Syntax Error: ${e.message}`);
                    }
                }
            }
        });

        // ============================================================
        // 🚀 LAUNCH BOT
        // ============================================================
        bot.launch({ dropPendingUpdates: true })
            .then(() => console.log(`🟢 [Started] ${botDoc.name} (@${botInfo.username})`))
            .catch(err => {
                console.error(`🔴 [Crash] ${botDoc.name}:`, err.message);
                delete activeBotInstances[botId];
            });

        activeBotInstances[botId] = bot;
        return { success: true };

    } catch (e) {
        console.error(`❌ [Start Failed] ${botDoc.name}:`, e.message);
        
        if (e.message.includes('409 Conflict')) {
            return { success: false, message: 'Conflict! Terminated by other instance. Check if bot is running elsewhere.' };
        }
        if (e.message.includes('401 Unauthorized')) {
            return { success: false, message: 'Invalid Token! Please check bot token.' };
        }
        
        return { success: false, message: 'Failed to start. Check server logs.' };
    }
}


// =================================================================================
// 5. API ROUTES (COMMUNICATION WITH FRONTEND)
// =================================================================================

/**
 * 🔹 ROUTE: Get User Data & Bot List
 */
app.post('/api/bots', async (req, res) => {
    const { userId, username, firstName } = req.body;
    if(!userId) return res.json({ bots: [], user: null });

    let user = await UserModel.findOne({ userId });
    
    // Sync User Data
    if (!user) {
        user = await UserModel.create({ userId, username, firstName });
    } else {
        if(firstName && user.firstName !== firstName) user.firstName = firstName;
        if(username && user.username !== username) user.username = username;
        user.lastActive = new Date();
        await user.save();
    }

    const bots = await BotModel.find({ ownerId: userId }).sort({ createdAt: -1 });
    res.json({ bots, user });
});

/**
 * 🔹 ROUTE: Create New Bot
 */
app.post('/api/createBot', async (req, res) => {
    const { token, name, userId } = req.body;
    
    // 1. Limit Check
    const user = await UserModel.findOne({ userId });
    const count = await BotModel.countDocuments({ ownerId: userId });
    
    if (count >= user.botLimit) {
        return res.json({ success: false, message: `Limit Reached (${user.botLimit})! Upgrade Plan.` });
    }
    
    // 2. Validation
    if(!token.includes(':')) {
        return res.json({ success: false, message: 'Invalid Bot Token Format' });
    }

    const existing = await BotModel.findOne({ token });
    if (existing) {
        return res.json({ success: false, message: 'Token already used by another user!' });
    }

    // 3. Create
    const newBot = await BotModel.create({ ownerId: userId, name, token });
    res.json({ success: true, bot: newBot });
});

/**
 * 🔹 ROUTE: Toggle Bot (Start / Stop)
 */
app.post('/api/toggleBot', async (req, res) => {
    const { botId, action } = req.body;
    const bot = await BotModel.findById(botId);
    
    if(!bot) return res.json({ success: false, message: 'Bot not found in DB' });

    if (action === 'start') {
        // Attempt Start
        const result = await startBotEngine(bot);
        
        if (result.success) {
            bot.status = 'RUNNING';
            bot.startedAt = new Date();
            await bot.save();
            res.json({ success: true, startedAt: bot.startedAt });
        } else {
            res.json({ success: false, message: result.message });
        }
    } else {
        // Stop Logic
        if (activeBotInstances[botId]) {
            try { activeBotInstances[botId].stop('SIGINT'); } catch(e) {}
            delete activeBotInstances[botId];
        }
        
        bot.status = 'STOPPED';
        bot.startedAt = null;
        await bot.save();
        res.json({ success: true });
    }
});

/**
 * 🔹 ROUTE: Restart Bot
 */
app.post('/api/restartBot', async (req, res) => {
    const { botId } = req.body;
    const bot = await BotModel.findById(botId);
    
    if(!bot) return res.json({ success: false, message: 'Bot not found' });

    // 1. Force Stop
    if (activeBotInstances[botId]) {
        try { activeBotInstances[botId].stop(); } catch(e) {}
        delete activeBotInstances[botId];
    }

    // 2. Start Again
    const result = await startBotEngine(bot);
    if (result.success) {
        bot.status = 'RUNNING';
        bot.startedAt = new Date();
        bot.restartCount = (bot.restartCount || 0) + 1;
        await bot.save();
        res.json({ success: true, startedAt: bot.startedAt });
    } else {
        bot.status = 'STOPPED';
        await bot.save();
        res.json({ success: false, message: result.message });
    }
});

/**
 * 🔹 ROUTE: Delete Bot
 */
app.post('/api/deleteBot', async (req, res) => {
    const { botId } = req.body;
    
    // Stop if running
    if (activeBotInstances[botId]) {
        try { activeBotInstances[botId].stop(); } catch(e){}
        delete activeBotInstances[botId];
    }
    
    // Delete Bot Data
    await BotModel.findByIdAndDelete(botId);
    // Delete Associated Users (Cleanup)
    await EndUserModel.deleteMany({ botId: botId }); 
    
    res.json({ success: true });
});

/**
 * 🔹 ROUTE: AI Generation (OpenRouter API - Backend Proxy)
 * ✅ Replaced Google SDK with Axios Call to OpenRouter
 * ✅ Fixes 'Model Not Found' Error
 */
app.post('/api/ai-generate', async (req, res) => {
    const { prompt, type, model } = req.body;
    
    console.log(`🤖 [AI Request] Type: ${type}`);

    if (!OPENROUTER_API_KEY) {
        return res.json({ success: false, message: "AI API Key Missing in Server" });
    }

    try {
        let systemInstruction = "";
        
        if(type === 'code') {
            systemInstruction = `You are a specialized Telegram Bot Code Generator using Telegraf.js syntax. 
            Write ONLY the javascript code block that goes inside the function body. 
            Do NOT include function declaration, imports or requires.
            Do NOT use markdown like \`\`\`javascript.
            Use 'ctx.reply', 'ctx.replyWithPhoto', 'Markup' etc.
            
            USER PROMPT: "${prompt}"`;
        } else {
            systemInstruction = `Write a Telegram Broadcast message in HTML format based on this topic: "${prompt}".
            Do NOT include <html> or <body> tags. Use Emojis to make it attractive. Keep it concise.
            Do NOT use markdown.`;
        }

        // Call OpenRouter API
        const response = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
            // Using a reliable free model, or falling back to user choice
            model: "google/gemini-2.0-flash-exp:free", 
            messages: [
                { role: "system", content: systemInstruction },
                { role: "user", content: prompt }
            ]
        }, {
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
                "HTTP-Referer": WEB_APP_URL, // Site URL for rankings on openrouter.ai.
                "X-Title": "Laga Host Bot"  // Site title for rankings on openrouter.ai.
            }
        });

        let aiContent = response.data?.choices?.[0]?.message?.content;

if (!aiContent) {
    throw new Error("Empty response from AI Provider");
}

// 🔥 OpenRouter array response handle
if (Array.isArray(aiContent)) {
    aiContent = aiContent
        .map(item => item.text || '')
        .join('');
}

if (typeof aiContent !== 'string') {
    throw new Error("Invalid AI response format");
}

console.log("✅ [AI Success] Content Generated");

const cleanText = aiContent
    .replace(/```javascript/g, '')
    .replace(/```html/g, '')
    .replace(/```/g, '')
    .trim();

res.json({ success: true, result: cleanText });

    } catch (e) {
        console.error("❌ [AI Error]:", e.response ? e.response.data : e.message);
        
        let msg = "AI Service Busy. Try again later.";
        if (e.response && e.response.status === 401) msg = "Invalid API Key in Server";
        
        res.json({ success: false, message: msg });
    }
});

/**
 * 🔹 ROUTES: JS Editor (CRUD Operations)
 */
app.post('/api/getCommands', async (req, res) => {
    const bot = await BotModel.findById(req.body.botId);
    res.json(bot ? bot.commands : {});
});

app.post('/api/saveCommand', async (req, res) => {
    const { botId, command, code } = req.body;
    const cleanCmd = command.replace('/', '').trim();
    await BotModel.findByIdAndUpdate(botId, { $set: { [`commands.${cleanCmd}`]: code } });
    res.json({ success: true });
});

app.post('/api/deleteCommand', async (req, res) => {
    const { botId, command } = req.body;
    await BotModel.findByIdAndUpdate(botId, { $unset: { [`commands.${command}`]: "" } });
    res.json({ success: true });
});

/**
 * 🔹 ROUTE: Payment Processing
 */
app.post('/api/submit-payment', async (req, res) => {
    const { trxId, plan, amount, userId, user, method } = req.body;

    if (method === 'referral') {
        const dbUser = await UserModel.findOne({ userId });
        const required = plan === 'Pro' ? 50 : 80;
        
        if (dbUser.referrals < required) {
            return res.json({ success: false, message: `Insufficient Points! Need ${required}.` });
        }
        
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 30);
        
        dbUser.plan = plan;
        dbUser.botLimit = plan === 'Pro' ? 5 : 10;
        dbUser.planExpiresAt = expiry;
        dbUser.referrals -= required;
        await dbUser.save();
        
        return res.json({ success: true, message: `Upgraded to ${plan} with Points! 🎉` });
    }

    try {
        await mainBot.telegram.sendMessage(ADMIN_CONFIG.chatId, 
            `💰 <b>NEW PAYMENT REQUEST</b>\n\n` +
            `👤 User: @${user} (<code>${userId}</code>)\n` +
            `💎 Plan: <b>${plan}</b>\n` +
            `💵 Amount: ${amount}৳\n` +
            `🧾 TrxID: <code>${trxId}</code>\n` +
            `📅 Date: ${new Date().toLocaleString()}`,
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
        res.json({ success: false, message: 'Could not contact Admin Bot.' }); 
    }
});

/**
 * 🔹 ROUTE: Global Broadcast System
 */
app.post('/api/broadcast', async (req, res) => {
    const { message, adminId } = req.body;
    
    if (adminId !== ADMIN_CONFIG.chatId) return res.json({ success: false, message: 'Forbidden' });

    let totalSent = 0;

    // 1. Send to Platform Users (Main Bot)
    const mainUsers = await UserModel.find({});
    mainUsers.forEach((u, i) => {
        setTimeout(async () => {
            try {
                await mainBot.telegram.sendMessage(u.userId, message, { parse_mode: 'HTML' });
            } catch(e) {}
        }, i * 50);
        totalSent++;
    });

    // 2. Send to Child Bot Users
    const allBots = await BotModel.find({ status: 'RUNNING' });

    for (const bot of allBots) {
        const endUsers = await EndUserModel.find({ botId: bot._id.toString() });
        if(endUsers.length === 0) continue;

        let senderBot = activeBotInstances[bot._id.toString()];
        if (!senderBot) {
            try { senderBot = new Telegraf(bot.token); } catch(e) { continue; }
        }

        endUsers.forEach((eu, index) => {
            setTimeout(async () => {
                try {
                    await senderBot.telegram.sendMessage(eu.tgId, message, { parse_mode: 'HTML' });
                } catch(e) {
                    if(e.code === 403) {
                        await EndUserModel.findByIdAndDelete(eu._id);
                    }
                }
            }, index * 100 + (mainUsers.length * 50));
            totalSent++;
        });
    }

    res.json({ success: true, total: totalSent });
});


// =================================================================================
// 6. MAIN BOT & CRON JOBS
// =================================================================================

// --- CRON: DAILY PLAN EXPIRY CHECK ---
cron.schedule('0 0 * * *', async () => {
    console.log('🔄 [CRON] Checking Expired Plans...');
    const now = new Date();
    
    const expiredUsers = await UserModel.find({ 
        plan: { $ne: 'Free' }, 
        planExpiresAt: { $lt: now } 
    });
    
    for (const user of expiredUsers) {
        // Downgrade
        user.plan = 'Free';
        user.botLimit = 1;
        user.planExpiresAt = null;
        await user.save();
        
        // Stop extra bots
        const bots = await BotModel.find({ ownerId: user.userId });
        if(bots.length > 1) {
            for(let i=1; i<bots.length; i++) {
                const bId = bots[i]._id.toString();
                if(activeBotInstances[bId]) {
                    try { activeBotInstances[bId].stop(); } catch(e){}
                    delete activeBotInstances[bId];
                }
                bots[i].status = 'STOPPED';
                bots[i].startedAt = null;
                await bots[i].save();
            }
        }

        try {
            await mainBot.telegram.sendMessage(user.userId, '⚠️ <b>Plan Expired</b>\nYou have been downgraded to Free plan.', { parse_mode: 'HTML' });
        } catch(e){}
    }
});

// --- MAIN BOT: COMMANDS ---
mainBot.command('start', async (ctx) => {
    const args = ctx.message.text.split(' ');
    const referrerId = args[1];

    let user = await UserModel.findOne({ userId: ctx.from.id.toString() });
    
    if (!user) {
        user = await UserModel.create({
            userId: ctx.from.id.toString(),
            username: ctx.from.username,
            firstName: ctx.from.first_name,
            referredBy: referrerId && referrerId !== ctx.from.id.toString() ? referrerId : null
        });

        if (user.referredBy) {
            await UserModel.findOneAndUpdate({ userId: user.referredBy }, { $inc: { referrals: 1 } });
            try { 
                await ctx.telegram.sendMessage(user.referredBy, `🎉 <b>New Referral!</b>\n${ctx.from.first_name} joined.`, {parse_mode: 'HTML'}); 
            } catch(e){}
        }
    }

    const buttons = ADMIN_CONFIG.channels.map(ch => [Markup.button.url(`📢 Join ${ch.name}`, ch.url)]);
    buttons.push([Markup.button.webApp('🚀 Open Dashboard', WEB_APP_URL)]);

    await ctx.replyWithHTML(
        `👋 <b>Welcome to Laga Host!</b>\n\n` +
        `Create, Manage & Edit Telegram Bots easily.\n` +
        `Powered by OpenRouter AI (Gemini 2.0).\n\n` +
        `👇 <b>Click below to start:</b>`,
        Markup.inlineKeyboard(buttons)
    );
});

// --- MAIN BOT: ACTIONS ---
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
    
    await ctx.editMessageText(`✅ Approved ${plan} for ${userId} by Admin.`);
    try { 
        await mainBot.telegram.sendMessage(userId, `✅ <b>Payment Accepted!</b>\nYou are now on <b>${plan}</b> plan. Enjoy!`, { parse_mode: 'HTML' }); 
    } catch(e){}
});

mainBot.action(/^decline:(\d+)$/, async (ctx) => {
    const userId = ctx.match[1];
    await ctx.editMessageText(`❌ Declined by Admin.`);
    try { 
        await mainBot.telegram.sendMessage(userId, `❌ <b>Payment Declined</b>\nTransaction ID did not match or invalid amount.`, { parse_mode: 'HTML' }); 
    } catch(e){}
});


// =================================================================================
// 7. SYSTEM STARTUP
// =================================================================================

// ✅ MAIN BOT LAUNCH: Force delete webhook before polling
mainBot.telegram.deleteWebhook().then(() => {
    mainBot.launch({ dropPendingUpdates: true })
        .then(() => console.log('🤖 [Main Bot] Online'))
        .catch((err) => console.error('❌ [Main Bot] Error:', err));
});

// Auto-Restore Previous Session Bots
mongoose.connection.once('open', async () => {
    const runningBots = await BotModel.find({ status: 'RUNNING' });
    if(runningBots.length > 0) {
        console.log(`🔄 [System] Restoring ${runningBots.length} active bots...`);
        let successCount = 0;
        for (const bot of runningBots) {
            const result = await startBotEngine(bot);
            if(result.success) successCount++;
            await new Promise(r => setTimeout(r, 200));
        }
        console.log(`🚀 [System] Restored ${successCount}/${runningBots.length} bots.`);
    }
});

// Serve Frontend
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Graceful Shutdown
process.once('SIGINT', () => {
    mainBot.stop('SIGINT');
    Object.values(activeBotInstances).forEach(b => b.stop('SIGINT'));
});
process.once('SIGTERM', () => {
    mainBot.stop('SIGTERM');
    Object.values(activeBotInstances).forEach(b => b.stop('SIGTERM'));
});

// Start Express Server
app.listen(PORT, () => console.log(`🌍 [Server] Running on port ${PORT}`));
