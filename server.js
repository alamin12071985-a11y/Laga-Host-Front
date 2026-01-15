/**
 * =================================================================================
 * PROJECT: LAGA HOST ULTIMATE SERVER (SECURE EDITION)
 * VERSION: 3.6.0 (UI/UX Overhaul)
 * AUTHOR: Laga Host Team
 * DESCRIPTION: Backend server for Telegram Bot Hosting Platform with AI features.
 * =================================================================================
 */

// 1. IMPORT DEPENDENCIES
// ---------------------------------------------------------------------------------
require('dotenv').config();
const express = require('express');
const { Telegraf, Markup, session } = require('telegraf');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const cron = require('node-cron');
const moment = require('moment');
const axios = require('axios');
const fs = require('fs');

// =================================================================================
// 2. SYSTEM CONFIGURATION & ENVIRONMENT VARIABLES
// =================================================================================

const app = express();
const PORT = process.env.PORT || 3000;

// ⚠️ FRONTEND URL (Must match your Render/Vercel Frontend URL for CORS)
const WEB_APP_URL = process.env.WEB_APP_URL || "https://lagahost.onrender.com"; 

// 🤖 AI CONFIGURATION (OpenRouter API)
const OPENROUTER_API_KEY = "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";
const AI_MODEL = "google/gemini-2.0-flash-exp:free"; // Primary Model

// 🛠️ ADMIN & CHANNEL CONFIGURATION
const ADMIN_CONFIG = {
    // Main Bot Token (The host bot)
    token: process.env.BOT_TOKEN || "8264143788:AAH0fRkMqBw4rONo0WVEi-OyAVkPs9bRt84",
    // Your Personal Telegram ID for Admin Actions
    adminId: process.env.ADMIN_ID || "7605281774",
    // Channels for joining requirement
    channels: [
        { 
            name: 'Laga Tech Official', 
            username: '@lagatechofficial', 
            url: 'https://t.me/lagatechofficial' 
        },
        { 
            name: 'Snowman Adventure', 
            username: '@snowmanadventureannouncement', 
            url: 'https://t.me/snowmanadventureannouncement' 
        }
    ],
    // Payment Numbers
    payment: {
        nagad: "01761494948",
        bkash: "01761494948"
    }
};

// 🗄️ DATABASE CONNECTION STRING
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://lagahost:l%40g%40ho%24t@snowmanadventure.ocodku0.mongodb.net/snowmanadventure?retryWrites=true&w=majority&appName=snowmanadventure";

// =================================================================================
// 3. LOGGING UTILITIES (Internal Helpers)
// =================================================================================

/**
 * Logs messages with timestamp and type
 * @param {string} type - INFO, ERROR, WARN, SUCCESS
 * @param {string} message - The message content
 */
function logSystem(type, message) {
    const time = moment().format('YYYY-MM-DD HH:mm:ss');
    const icons = {
        INFO: 'ℹ️',
        ERROR: '❌',
        WARN: '⚠️',
        SUCCESS: '✅',
        DB: '🗄️',
        BOT: '🤖'
    };
    console.log(`${icons[type] || '🔹'} [${time}] [${type}] ${message}`);
}

// =================================================================================
// 4. DATABASE CONNECTION & MODELS
// =================================================================================

// Connect to MongoDB
mongoose.connect(MONGO_URI)
    .then(() => {
        logSystem('DB', 'MongoDB Connected Successfully');
        logSystem('DB', 'Ready for read/write operations');
    })
    .catch(err => {
        logSystem('ERROR', 'MongoDB Connection Error: ' + err.message);
        process.exit(1); // Fatal Error
    });

// --- SCHEMA DEFINITIONS ---

/**
 * USER SCHEMA
 * Stores main platform user data
 */
const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true, index: true },
    username: String,
    firstName: String,
    plan: { type: String, default: 'Free', enum: ['Free', 'Pro', 'VIP'] },
    botLimit: { type: Number, default: 1 },
    referrals: { type: Number, default: 0 },
    referredBy: String,
    totalPaid: { type: Number, default: 0 },
    planExpiresAt: { type: Date, default: null },
    joinedAt: { type: Date, default: Date.now },
    lastActive: { type: Date, default: Date.now }
});

/**
 * BOT SCHEMA
 * Stores hosted bot instances configuration
 */
const botSchema = new mongoose.Schema({
    ownerId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    token: { type: String, required: true, unique: true },
    status: { type: String, default: 'STOPPED' }, // RUNNING, STOPPED, ERROR
    startedAt: { type: Date, default: null },
    restartCount: { type: Number, default: 0 },
    commands: { type: Object, default: {} }, // Stores JS Code
    envVars: { type: Object, default: {} },  // Future Proofing
    isFirstLive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

/**
 * END USER SCHEMA
 * Stores users who chat with the hosted bots (for Broadcasts)
 */
const endUserSchema = new mongoose.Schema({
    tgId: { type: String, required: true },
    botId: { type: String, required: true, index: true },
    username: String,
    firstName: String,
    createdAt: { type: Date, default: Date.now }
});
// Compound index to prevent duplicate user entries per bot
endUserSchema.index({ tgId: 1, botId: 1 }, { unique: true });

/**
 * PAYMENT LOG SCHEMA
 * Tracks all transaction attempts
 */
const paymentSchema = new mongoose.Schema({
    userId: String,
    username: String,
    plan: String,
    amount: Number,
    trxId: String,
    method: String,
    status: { type: String, default: 'PENDING' }, // PENDING, APPROVED, DECLINED
    adminResponseDate: Date,
    date: { type: Date, default: Date.now }
});

// Create Models
const UserModel = mongoose.model('User', userSchema);
const BotModel = mongoose.model('Bot', botSchema);
const EndUserModel = mongoose.model('EndUser', endUserSchema);
const PaymentModel = mongoose.model('Payment', paymentSchema);

// =================================================================================
// 5. GLOBAL MIDDLEWARE & SETUP
// =================================================================================

// RAM Storage for Active Bot Instances
// Format: { 'bot_db_id': TelegrafInstance }
let activeBotInstances = {}; 

// Express Configuration
app.use(cors()); // Allow Cross-Origin Requests
app.use(bodyParser.json({ limit: '50mb' })); // Support large payloads
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'))); // Serve Static Frontend

// Request Logger Middleware
app.use((req, res, next) => {
    // Only log API requests, skip static files to reduce noise
    if(req.path.startsWith('/api')) {
        // logSystem('INFO', `API Request: ${req.method} ${req.path}`);
    }
    next();
});

// Initialize Main Admin Bot
const mainBot = new Telegraf(ADMIN_CONFIG.token);

// =================================================================================
// 6. BOT ENGINE (THE CORE LOGIC)
// =================================================================================

/**
 * Starts a hosted bot instance
 * @param {Object} botDoc - The MongoDB document of the bot
 * @returns {Promise<Object>} Status object
 */
async function startBotEngine(botDoc) {
    const botId = botDoc._id.toString();

    // Check if already running
    if (activeBotInstances[botId]) {
        return { success: true, message: 'Bot is already active.' };
    }

    try {
        // Initialize Telegraf
        const bot = new Telegraf(botDoc.token);

        // 🛑 CRITICAL: Remove any Webhook to prevent conflicts with polling
        try {
            await bot.telegram.deleteWebhook();
        } catch (webhookErr) {
            // Ignore (webhook might not exist)
        }

        // Validate Token & Connection
        const botInfo = await bot.telegram.getMe();
        
        // Error Handler
        bot.catch((err, ctx) => {
            logSystem('ERROR', `[Child: ${botDoc.name}] ${err.message}`);
        });

        // ----------------------------------------------------
        // MIDDLEWARE 1: Analytics (Track End Users)
        // ----------------------------------------------------
        bot.use(async (ctx, next) => {
            if(ctx.from) {
                // Run in background to not block main thread
                (async () => {
                    try {
                        // Check if user exists in cache/db to minimize writes
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
                            logSystem('INFO', `[${botDoc.name}] New User: ${ctx.from.first_name}`);
                        }
                    } catch(e) {
                        // Ignore duplicate key errors silently
                    }
                })();
            }
            return next();
        });

        // ----------------------------------------------------
        // MIDDLEWARE 2: Dynamic Command Execution (JS Sandbox)
        // ----------------------------------------------------
        bot.on('message', async (ctx) => {
            if (!ctx.message.text) return;
            const text = ctx.message.text;
            
            // Check if it looks like a command
            if (text.startsWith('/')) {
                const cmdName = text.substring(1).split(' ')[0]; // Extract 'start' from '/start'
                
                // Fetch fresh code from DB (Allows realtime updates without restart)
                const freshBot = await BotModel.findById(botId);
                const code = freshBot?.commands?.[cmdName];
                
                if (code) {
                    try {
                        // 🔒 Create Sandbox Function
                        // We pass useful libraries to the user's code
                        const runUserCode = new Function('ctx', 'bot', 'Markup', 'axios', 'moment', `
                            try {
                                // User Code Starts Here
                                ${code}
                                // User Code Ends Here
                            } catch(runtimeError) {
                                ctx.reply('⚠️ <b>Execution Error:</b>\\n' + runtimeError.message, { parse_mode: 'HTML' });
                            }
                        `);
                        
                        // Execute
                        runUserCode(ctx, bot, Markup, axios, moment);
                        
                    } catch (syntaxError) {
                        ctx.reply(`❌ <b>Syntax Error:</b>\n${syntaxError.message}`, { parse_mode: 'HTML' });
                    }
                }
            }
        });

        // ----------------------------------------------------
        // LAUNCH INSTANCE
        // ----------------------------------------------------
        bot.launch({ dropPendingUpdates: true })
            .then(() => {
                logSystem('BOT', `Started: ${botDoc.name} (@${botInfo.username})`);
            })
            .catch(err => {
                logSystem('ERROR', `Crash [${botDoc.name}]: ${err.message}`);
                delete activeBotInstances[botId];
            });

        // Store instance in RAM
        activeBotInstances[botId] = bot;
        
        // Update first run flag if needed
        if (botDoc.isFirstLive) {
            botDoc.isFirstLive = false;
            await botDoc.save();
        }

        return { success: true, botInfo };

    } catch (error) {
        logSystem('ERROR', `Start Failed [${botDoc.name}]: ${error.message}`);
        
        // Return friendly error messages
        let userMsg = 'Failed to start. Check server logs.';
        if (error.message.includes('401')) userMsg = 'Invalid Bot Token! Please check BotFather.';
        if (error.message.includes('409')) userMsg = 'Conflict! Bot is running somewhere else.';

        return { success: false, message: userMsg };
    }
}

// =================================================================================
// 7. API ROUTES (FRONTEND COMMUNICATION)
// =================================================================================

/**
 * ROUTE: /api/bots
 * Description: Fetches all bots for a specific user and syncs user info
 */
app.post('/api/bots', async (req, res) => {
    try {
        const { userId, username, firstName } = req.body;
        if(!userId) return res.status(400).json({ error: "Missing User ID" });

        // Find or Create User
        let user = await UserModel.findOne({ userId });
        
        if (!user) {
            user = await UserModel.create({ userId, username, firstName });
            logSystem('INFO', `New Platform User: ${firstName} (${userId})`);
        } else {
            // Update latest info
            let changed = false;
            if(firstName && user.firstName !== firstName) { user.firstName = firstName; changed = true; }
            if(username && user.username !== username) { user.username = username; changed = true; }
            user.lastActive = new Date();
            await user.save();
        }

        // Fetch Bots
        const bots = await BotModel.find({ ownerId: userId }).sort({ createdAt: -1 });
        
        res.json({ success: true, bots, user });

    } catch (e) {
        logSystem('ERROR', `API /bots: ${e.message}`);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

/**
 * ROUTE: /api/createBot
 * Description: Validates limit and creates a new bot
 */
app.post('/api/createBot', async (req, res) => {
    try {
        const { token, name, userId } = req.body;
        
        // 1. Check Plan Limits
        const user = await UserModel.findOne({ userId });
        const currentCount = await BotModel.countDocuments({ ownerId: userId });
        
        if (currentCount >= user.botLimit) {
            return res.json({ 
                success: false, 
                message: `Plan Limit Reached (${user.botLimit})! Please Upgrade.` 
            });
        }
        
        // 2. Validate Token Format (Basic Regex)
        if(!/^\d+:[A-Za-z0-9_-]{35,}$/.test(token)) {
            return res.json({ success: false, message: 'Invalid Bot Token Format' });
        }

        // 3. Check Duplication
        const existing = await BotModel.findOne({ token });
        if (existing) {
            return res.json({ success: false, message: 'This token is already in use!' });
        }

        // 4. Create Bot
        const newBot = await BotModel.create({ 
            ownerId: userId, 
            name: name.trim(), 
            token: token.trim() 
        });
        
        logSystem('INFO', `New Bot Created: ${name} by ${userId}`);
        res.json({ success: true, bot: newBot });

    } catch (e) {
        logSystem('ERROR', `API /createBot: ${e.message}`);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

/**
 * ROUTE: /api/toggleBot
 * Description: Starts or Stops a bot instance
 */
app.post('/api/toggleBot', async (req, res) => {
    try {
        const { botId, action } = req.body;
        const bot = await BotModel.findById(botId);
        
        if(!bot) return res.json({ success: false, message: 'Bot not found' });

        if (action === 'start') {
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
            // STOP Logic
            if (activeBotInstances[botId]) {
                try {
                    activeBotInstances[botId].stop('SIGINT');
                } catch(e) { console.error('Stop Error:', e); }
                delete activeBotInstances[botId];
            }
            
            bot.status = 'STOPPED';
            bot.startedAt = null;
            await bot.save();
            res.json({ success: true });
        }
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

/**
 * ROUTE: /api/restartBot
 * Description: Restarts a bot cleanly
 */
app.post('/api/restartBot', async (req, res) => {
    try {
        const { botId } = req.body;
        const bot = await BotModel.findById(botId);
        
        if(!bot) return res.json({ success: false, message: 'Bot not found' });

        // 1. Stop if running
        if (activeBotInstances[botId]) {
            try { activeBotInstances[botId].stop(); } catch(e) {}
            delete activeBotInstances[botId];
        }

        // 2. Start
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
    } catch (e) {
        res.json({ success: false, message: "Server Error" });
    }
});

/**
 * ROUTE: /api/deleteBot
 * Description: Permanently deletes bot and its data
 */
app.post('/api/deleteBot', async (req, res) => {
    try {
        const { botId } = req.body;
        
        // Stop instance
        if (activeBotInstances[botId]) {
            try { activeBotInstances[botId].stop(); } catch(e){}
            delete activeBotInstances[botId];
        }
        
        // Delete Data
        await BotModel.findByIdAndDelete(botId);
        // Clean up End Users to free space
        await EndUserModel.deleteMany({ botId: botId }); 
        
        logSystem('WARN', `Bot Deleted: ${botId}`);
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// =================================================================================
// 8. AI GENERATION API (OPENROUTER PROXY)
// =================================================================================

/**
 * ROUTE: /api/ai-generate
 * Description: Proxies requests to OpenRouter to avoid exposing Key in frontend
 */
app.post('/api/ai-generate', async (req, res) => {
    const { prompt, type, model } = req.body;

    if (!prompt) return res.json({ success: false, message: "No prompt provided" });
    if (!OPENROUTER_API_KEY) return res.json({ success: false, message: "Server API Key Missing" });

    // Define System Persona based on type
    let systemInstruction = "";
    if (type === 'code') {
        systemInstruction =
            "You are a Telegram Bot Code Generator using Telegraf.js (v4). " +
            "Write ONLY the raw JavaScript code block that goes inside a function. " +
            "Do NOT include function signature, imports, or markdown blocks. " +
            "Use variables: ctx, bot, Markup, axios. " +
            "Example: ctx.reply('Hello');";
    } else {
        systemInstruction =
            "You are a Copywriter for Telegram. " +
            "Write a Broadcast message in HTML format. " +
            "Use <b>bold</b>, <i>italic</i>, and emojis. " +
            "Do NOT use markdown.";
    }

    try {
        // Call OpenRouter
        const response = await axios.post(
            "https://openrouter.ai/api/v1/chat/completions",
            {
                model: model || AI_MODEL,
                messages: [
                    { role: "system", content: systemInstruction },
                    { role: "user", content: prompt }
                ]
            },
            {
                headers: {
                    Authorization: `Bearer ${OPENROUTER_API_KEY}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": WEB_APP_URL,
                    "X-Title": "Laga Host Backend"
                }
            }
        );

        const msgData = response.data?.choices?.[0]?.message;
        let finalContent = "";

        if (msgData?.content) {
            finalContent = msgData.content;
        }

        // Cleanup response (Remove Markdown ``` if present)
        finalContent = finalContent
            .replace(/```javascript/gi, "")
            .replace(/```html/gi, "")
            .replace(/```/g, "")
            .trim();

        if (!finalContent) {
            throw new Error("Empty AI Response");
        }

        res.json({ success: true, result: finalContent });

    } catch (e) {
        logSystem('ERROR', `AI Gen Failed: ${e.response?.data?.error?.message || e.message}`);
        res.json({ 
            success: false, 
            message: "AI Service Busy. Please try again." 
        });
    }
});

// =================================================================================
// 9. JS EDITOR ROUTES & PAYMENT
// =================================================================================

// Fetch Commands
app.post('/api/getCommands', async (req, res) => {
    try {
        const bot = await BotModel.findById(req.body.botId);
        res.json(bot ? bot.commands : {});
    } catch(e) { res.json({}) }
});

// Save Command
app.post('/api/saveCommand', async (req, res) => {
    try {
        const { botId, command, code } = req.body;
        // Sanitize command name
        const cleanCmd = command.replace('/', '').replace(/\s/g, '_');
        
        await BotModel.findByIdAndUpdate(botId, { 
            $set: { [`commands.${cleanCmd}`]: code } 
        });
        
        // If running, we don't restart, the sandbox fetches fresh code on next trigger
        res.json({ success: true });
    } catch(e) { res.json({ success: false }) }
});

// Delete Command
app.post('/api/deleteCommand', async (req, res) => {
    try {
        const { botId, command } = req.body;
        await BotModel.findByIdAndUpdate(botId, { 
            $unset: { [`commands.${command}`]: "" } 
        });
        res.json({ success: true });
    } catch(e) { res.json({ success: false }) }
});

// PAYMENT SUBMISSION HANDLER
app.post('/api/submit-payment', async (req, res) => {
    const { trxId, plan, amount, userId, user, method } = req.body;

    // A. REFERRAL PAYMENT (POINTS)
    if (method === 'referral') {
        const dbUser = await UserModel.findOne({ userId });
        const requiredPoints = plan === 'Pro' ? 50 : 80;
        
        if (dbUser.referrals < requiredPoints) {
            return res.json({ success: false, message: `Insufficient Points! Need ${requiredPoints}, Have ${dbUser.referrals}` });
        }
        
        // Apply Upgrade
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 30); // 30 Days
        
        dbUser.plan = plan;
        dbUser.botLimit = plan === 'Pro' ? 5 : 10;
        dbUser.planExpiresAt = expiry;
        dbUser.referrals -= requiredPoints;
        await dbUser.save();
        
        logSystem('SUCCESS', `User ${user} upgraded to ${plan} via Points`);
        return res.json({ success: true, message: `Redeemed ${plan} Plan Successfully!` });
    }

    // B. CASH PAYMENT (MANUAL VERIFICATION)
    try {
        // Save Log
        const payment = await PaymentModel.create({
            userId, username: user, plan, amount, trxId, method
        });

        // Notify Admin
        await mainBot.telegram.sendMessage(ADMIN_CONFIG.adminId, 
            `💰 <b>NEW PAYMENT REQUEST</b>\n\n` +
            `👤 User: @${user} (<code>${userId}</code>)\n` +
            `💎 Plan: <b>${plan}</b>\n` +
            `💵 Amount: ${amount}৳\n` +
            `🧾 TrxID: <code>${trxId}</code>\n` +
            `📅 Date: ${moment().format('DD MMM YYYY, h:mm A')}`,
            { 
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '✅ Approve', callback_data: `approve:${userId}:${plan}:${payment._id}` }, 
                        { text: '❌ Decline', callback_data: `decline:${userId}:${payment._id}` }
                    ]]
                }
            }
        );

        res.json({ success: true, message: 'Payment submitted for review! Check back soon.' });
    } catch(e) { 
        logSystem('ERROR', `Payment Submit Error: ${e.message}`);
        res.json({ success: false, message: 'Could not contact Admin. Try again.' }); 
    }
});

// =================================================================================
// 10. CRON JOBS (AUTOMATION)
// =================================================================================

// Runs every day at midnight (00:00)
cron.schedule('0 0 * * *', async () => {
    logSystem('INFO', 'running Daily Plan Expiry Check...');
    const now = new Date();
    
    try {
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
            
            // Manage Excessive Bots
            const bots = await BotModel.find({ ownerId: user.userId });
            if(bots.length > 1) {
                // Stop and disable bots beyond limit 1
                for(let i = 1; i < bots.length; i++) {
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
                await mainBot.telegram.sendMessage(user.userId, 
                    '⚠️ <b>Plan Expired</b>\n\n' +
                    'Your subscription has ended. You have been downgraded to the <b>Free</b> plan.\n' +
                    'Extra bots have been stopped.', 
                    { parse_mode: 'HTML' }
                );
            } catch(e){}
        }
    } catch(err) {
        logSystem('ERROR', 'Cron Job Failed: ' + err.message);
    }
});

// =================================================================================
// 11. MAIN ADMIN BOT LOGIC (IMPROVED & SECURE)
// =================================================================================

// START Command
mainBot.command('start', async (ctx) => {
    try {
        const args = ctx.message.text.split(' ');
        const referrerId = args[1]; // Get referral ID if present

        let user = await UserModel.findOne({ userId: ctx.from.id.toString() });
        
        if (!user) {
            // Register New User
            user = await UserModel.create({
                userId: ctx.from.id.toString(),
                username: ctx.from.username,
                firstName: ctx.from.first_name,
                referredBy: referrerId && referrerId !== ctx.from.id.toString() ? referrerId : null
            });

            logSystem('INFO', `New User Joined: ${ctx.from.first_name}`);

            // Handle Referral Bonus
            if (user.referredBy) {
                await UserModel.findOneAndUpdate({ userId: user.referredBy }, { $inc: { referrals: 1 } });
                try { 
                    await ctx.telegram.sendMessage(user.referredBy, 
                        `🎉 <b>New Referral!</b>\n${ctx.from.first_name} just joined using your link.\nYou earned <b>+1 Point</b>.`, 
                        { parse_mode: 'HTML' }
                    ); 
                } catch(e){}
            }
        }

        // Build UI
        const buttons = [];
        ADMIN_CONFIG.channels.forEach(ch => {
            buttons.push([Markup.button.url(`📢 Join ${ch.name}`, ch.url)]);
        });
        buttons.push([Markup.button.webApp('🚀 Open Laga Host Dashboard', WEB_APP_URL)]);

        const welcomeText = 
            `👋 <b>Welcome to Laga Host AI!</b>\n\n` +
            `The Ultimate Telegram Bot Hosting Platform powered by <b>Gemini 2.0</b>.\n\n` +
            `✨ <b>Features:</b>\n` +
            `• host Bots 24/7\n` +
            `• AI Code Generator\n` +
            `• Broadcast Tools\n` +
            `• No Coding Required\n\n` +
            `👇 <b>Click below to launch App:</b>`;

        await ctx.replyWithHTML(welcomeText, Markup.inlineKeyboard(buttons));

    } catch (e) {
        console.error('Start Error:', e);
    }
});

// PAYMENT APPROVAL CALLBACK
mainBot.action(/^approve:(\d+):(\w+):(.+)$/, async (ctx) => {
    try {
        const userId = ctx.match[1];
        const plan = ctx.match[2];
        const payId = ctx.match[3];
        const limits = { 'Pro': 5, 'VIP': 10 };
        
        // Expiry Calculation
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 30);

        // Update User
        await UserModel.findOneAndUpdate(
            { userId }, 
            { plan, botLimit: limits[plan], planExpiresAt: expiry }
        );
        
        // Update Payment Log
        await PaymentModel.findByIdAndUpdate(payId, { status: 'APPROVED', adminResponseDate: new Date() });

        // Update Admin Message
        await ctx.editMessageText(
            `${ctx.callbackQuery.message.text}\n\n✅ <b>APPROVED</b> by ${ctx.from.first_name}`, 
            { parse_mode: 'HTML' }
        );

        // Notify User
        await mainBot.telegram.sendMessage(userId, 
            `✅ <b>Payment Approved!</b>\n\n` +
            `You have been upgraded to <b>${plan}</b> plan.\n` +
            `Bot Limit: ${limits[plan]}\n` +
            `Valid until: ${moment(expiry).format('DD MMM YYYY')}`, 
            { parse_mode: 'HTML' }
        );

    } catch(e) { console.error(e); }
});

// PAYMENT DECLINE CALLBACK
mainBot.action(/^decline:(\d+):(.+)$/, async (ctx) => {
    try {
        const userId = ctx.match[1];
        const payId = ctx.match[2];
        
        await PaymentModel.findByIdAndUpdate(payId, { status: 'DECLINED', adminResponseDate: new Date() });

        await ctx.editMessageText(
            `${ctx.callbackQuery.message.text}\n\n❌ <b>DECLINED</b> by ${ctx.from.first_name}`, 
            { parse_mode: 'HTML' }
        );

        await mainBot.telegram.sendMessage(userId, 
            `❌ <b>Payment Declined</b>\n\n` +
            `Your transaction details could not be verified or amount was incorrect.\n` +
            `Please contact admin for support.`, 
            { parse_mode: 'HTML' }
        );
    } catch(e) { console.error(e); }
});

// ADMIN STATS COMMAND
mainBot.command('stats', async (ctx) => {
    if(ctx.from.id.toString() !== ADMIN_CONFIG.adminId) return;

    const userCount = await UserModel.countDocuments();
    const botCount = await BotModel.countDocuments();
    const runCount = await BotModel.countDocuments({ status: 'RUNNING' });
    const paidCount = await UserModel.countDocuments({ plan: { $ne: 'Free' } });

    ctx.replyWithHTML(
        `📊 <b>System Statistics</b>\n\n` +
        `👤 Users: <b>${userCount}</b>\n` +
        `🤖 Total Bots: <b>${botCount}</b>\n` +
        `🟢 Running: <b>${runCount}</b>\n` +
        `💎 Premium Users: <b>${paidCount}</b>`
    );
});

// 🔥 SECURE ADMIN BROADCAST COMMAND (Moved from API)
mainBot.command('broadcast', async (ctx) => {
    // 1. Security Check: Only Admin
    if (ctx.from.id.toString() !== ADMIN_CONFIG.adminId) {
        return ctx.reply("⛔ Unauthorized: This command is for Admins only.");
    }

    // 2. Parse Message
    // Usage: /broadcast <message>
    const message = ctx.message.text.replace('/broadcast', '').trim();
    if (!message) {
        return ctx.reply("⚠️ Usage: <code>/broadcast Your Message Here</code> (HTML Supported)", { parse_mode: 'HTML' });
    }

    const statusMsg = await ctx.reply("⏳ <b>Starting Broadcast...</b>\nTarget: All Main Users & Hosted Bot Users", { parse_mode: 'HTML' });
    let totalSent = 0;
    let errors = 0;

    logSystem('INFO', `Admin Broadcast Started by ${ctx.from.first_name}`);

    // 3. PHASE 1: Send to Main Bot Users
    try {
        const mainUsers = await UserModel.find({}, 'userId');
        for (const u of mainUsers) {
            try {
                await mainBot.telegram.sendMessage(u.userId, message, { parse_mode: 'HTML' });
                totalSent++;
                // Rate Limiting (30ms)
                await new Promise(r => setTimeout(r, 30));
            } catch(e) {
                // Ignore blocks
            }
        }
    } catch(e) { console.error('Main Broadcast Error', e); }

    // 4. PHASE 2: Send to Child Bot Users
    // This iterates through all running bots and uses their instances to send messages
    try {
        const runningBots = await BotModel.find({ status: 'RUNNING' });

        for (const bot of runningBots) {
            const endUsers = await EndUserModel.find({ botId: bot._id.toString() });
            if(endUsers.length === 0) continue;

            // Get active instance or create temp
            let senderBot = activeBotInstances[bot._id.toString()];
            if (!senderBot) {
                try { senderBot = new Telegraf(bot.token); } catch(e) { continue; }
            }

            for (const eu of endUsers) {
                try {
                    await senderBot.telegram.sendMessage(eu.tgId, message, { parse_mode: 'HTML' });
                    totalSent++;
                    await new Promise(r => setTimeout(r, 50)); // Slower for child bots
                } catch(e) {
                    errors++;
                    if(e.code === 403 || e.code === 400) {
                        // User blocked bot or invalid ID, remove from DB
                        await EndUserModel.findByIdAndDelete(eu._id);
                    }
                }
            }
        }
    } catch(e) { console.error('Child Broadcast Error', e); }

    // 5. Report Result
    logSystem('SUCCESS', `Broadcast Completed. Sent: ${totalSent}`);
    
    // Delete status msg and send final report
    try {
        await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id);
    } catch(e){}

    await ctx.reply(
        `✅ <b>Broadcast Complete</b>\n\n` +
        `📨 Sent to: <b>${totalSent}</b> users\n` +
        `❌ Errors/Blocks: <b>${errors}</b>`,
        { parse_mode: 'HTML' }
    );
});

// =================================================================================
// 12. SYSTEM STARTUP SEQUENCE
// =================================================================================

/**
 * 1. Launch Main Bot
 * 2. Connect DB
 * 3. Restore Sessions
 * 4. Start HTTP Server
 */

// A. Launch Main Bot
mainBot.telegram.deleteWebhook().then(() => {
    mainBot.launch({ dropPendingUpdates: true })
        .then(() => logSystem('SUCCESS', 'Main Admin Bot Online'))
        .catch(err => logSystem('ERROR', 'Main Bot Fail: ' + err.message));
});

// B. Restore Previous Sessions (Auto-Restart Bots after server reboot)
mongoose.connection.once('open', async () => {
    const runningBots = await BotModel.find({ status: 'RUNNING' });
    if(runningBots.length > 0) {
        logSystem('INFO', `Restoring ${runningBots.length} active bot sessions...`);
        
        let restored = 0;
        for (const bot of runningBots) {
            // Add slight delay to prevent CPU spike
            await new Promise(r => setTimeout(r, 500));
            const res = await startBotEngine(bot);
            if(res.success) restored++;
        }
        
        logSystem('SUCCESS', `Restored ${restored}/${runningBots.length} bots successfully.`);
    }
});

// C. Serve Frontend for any unknown routes (SPA Support)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// D. Graceful Shutdown
process.once('SIGINT', () => {
    logSystem('WARN', 'SIGINT received. Shutting down...');
    mainBot.stop('SIGINT');
    Object.values(activeBotInstances).forEach(b => b.stop('SIGINT'));
    process.exit(0);
});
process.once('SIGTERM', () => {
    logSystem('WARN', 'SIGTERM received. Shutting down...');
    mainBot.stop('SIGTERM');
    Object.values(activeBotInstances).forEach(b => b.stop('SIGTERM'));
    process.exit(0);
});

// E. Start Express Server
app.listen(PORT, () => {
    logSystem('SUCCESS', `Server running on port ${PORT}`);
    logSystem('INFO', `Dashboard URL: ${WEB_APP_URL}`);
});
