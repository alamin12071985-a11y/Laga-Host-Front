// 1.1 Load Environment Variables (Security First)
require('dotenv').config();

// 1.2 Core Node.js Modules
const path = require('path');
const fs = require('fs');
const crypto = require('crypto'); // For encryption and secure random generation
const http = require('http');     // Core HTTP server

// 1.3 Third-Party Frameworks
const express = require('express');           // The Web Server Framework
const { Telegraf, Markup, session } = require('telegraf'); // Telegram Bot API Wrapper
const mongoose = require('mongoose');         // MongoDB Object Data Modeling
const cors = require('cors');                 // Cross-Origin Resource Sharing
const bodyParser = require('body-parser');    // HTTP Body Parsing Middleware
const cron = require('node-cron');            // Task Scheduling (Cron Jobs)
const moment = require('moment');             // Date & Time Manipulation Library
const axios = require('axios');               // HTTP Client for Sandbox Requests

// =================================================================================================
// PART 2: GLOBAL CONFIGURATION & CONSTANTS
// =================================================================================================

// 2.1 Initialize Express Application
const app = express();

// 2.2 Define Server Port
// Defaults to 3000 if not specified in the environment variables
const PORT = process.env.PORT || 3000;

// 2.3 System Versioning
const SYSTEM_VERSION = "10.0.0";
const SYSTEM_NAME = "Laga Host Titanium";

// 2.4 WebApp Configuration
// This URL is crucial for the Mini App buttons to work correctly
const WEB_APP_URL = process.env.WEB_APP_URL || "https://lagahost.onrender.com";

// 2.5 Admin & Platform Configuration
// Centralized settings for the master bot and admin privileges
const ADMIN_CONFIG = {
    // The Main Host Bot Token
    token: process.env.BOT_TOKEN || "8264143788:AAH0fRkMqBw4rONo0WVEi-OyAVkPs9bRt84",
    
    // Super Admin Telegram ID
    adminId: process.env.ADMIN_ID || "7605281774",
    
    // Support Channels & Groups
    channels: [
        { 
            name: 'Laga Tech Official', 
            username: '@lagatechofficial', 
            url: 'https://t.me/lagatechofficial',
            id: -100123456789 // Placeholder Channel ID
        },
        { 
            name: 'Snowman Adventure', 
            username: '@snowmanadventureannouncement', 
            url: 'https://t.me/snowmanadventureannouncement' 
        }
    ],

    // Support Contact Information
    support: {
        contactUser: "@lagatech",
        channelUrl: "https://t.me/lagatech",
        youtubeUrl: "https://youtube.com/@lagatech?si=LC_FiXS4BdwR11XR",
        paymentNumber: "01761494948" // Bkash/Nagad Personal
    }
};

// 2.6 Subscription Plans & Resource Limits
// Defines what each tier of user gets
const PLAN_LIMITS = {
    'Free': { 
        botLimit: 1, 
        validityDays: 9999, // Effectively Lifetime
        pricePoints: 0,
        cpuPriority: 1, // Lowest Priority
        maxBroadcasts: 1,
        supportLevel: 'Community'
    },
    'Pro':  { 
        botLimit: 5, 
        validityDays: 30, 
        pricePoints: 50,
        cpuPriority: 2, // Medium Priority
        maxBroadcasts: 10,
        supportLevel: 'Priority'
    },
    'VIP':  { 
        botLimit: 10, 
        validityDays: 30, 
        pricePoints: 80,
        cpuPriority: 3, // High Priority
        maxBroadcasts: 999,
        supportLevel: 'Dedicated'
    }
};

// 2.7 Database Connection String
// Using MongoDB Atlas for cloud storage
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://lagahost:l%40g%40ho%24t@snowmanadventure.ocodku0.mongodb.net/snowmanadventure?retryWrites=true&w=majority&appName=snowmanadventure";

// =================================================================================================
// PART 3: ADVANCED LOGGING & DEBUGGING UTILITIES
// =================================================================================================

/**
 * 3.1 Logger Class
 * Provides a standardized way to log messages with timestamps and color coding.
 * Essential for debugging in production environments like Render or Heroku.
 */
const Logger = {
    // Information Logs (Blue)
    info: (message) => {
        console.log(`\x1b[36mℹ️  [INFO]    ${moment().format('YYYY-MM-DD HH:mm:ss')} ➤\x1b[0m ${message}`);
    },
    
    // Success Logs (Green)
    success: (message) => {
        console.log(`\x1b[32m✅  [SUCCESS] ${moment().format('YYYY-MM-DD HH:mm:ss')} ➤\x1b[0m ${message}`);
    },
    
    // Warning Logs (Yellow)
    warn: (message) => {
        console.log(`\x1b[33m⚠️  [WARN]    ${moment().format('YYYY-MM-DD HH:mm:ss')} ➤\x1b[0m ${message}`);
    },
    
    // Error Logs (Red)
    error: (message) => {
        console.error(`\x1b[31m❌  [ERROR]   ${moment().format('YYYY-MM-DD HH:mm:ss')} ➤\x1b[0m ${message}`);
    },
    
    // Database Logs (Magenta)
    db: (message) => {
        console.log(`\x1b[35m🗄️  [DB]      ${moment().format('YYYY-MM-DD HH:mm:ss')} ➤\x1b[0m ${message}`);
    },
    
    // Bot Activity Logs (Cyan)
    bot: (message) => {
        console.log(`\x1b[34m🤖  [BOT]     ${moment().format('YYYY-MM-DD HH:mm:ss')} ➤\x1b[0m ${message}`);
    },
    
    // Security Audit Logs (Yellow/Orange)
    secure: (message) => {
        console.log(`\x1b[33m🛡️  [SECURE]  ${moment().format('YYYY-MM-DD HH:mm:ss')} ➤\x1b[0m ${message}`);
    },

    // Broadcast Logs (White)
    broadcast: (message) => {
        console.log(`\x1b[37m📢  [CAST]    ${moment().format('YYYY-MM-DD HH:mm:ss')} ➤\x1b[0m ${message}`);
    }
};

/**
 * 3.2 Sleep Function
 * A Promise-based delay function used for rate limiting to avoid Telegram API bans.
 * @param {number} ms - Milliseconds to sleep
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 3.3 Bot Token Validator
 * Validates the format of a Telegram Bot Token using Regex.
 * Format: 123456789:ABCDefGHIjklmnOPQrstUVwxyz
 */
const isValidBotToken = (token) => {
    return /^\d+:[A-Za-z0-9_-]{35,}$/.test(token);
};

/**
 * 3.4 Date Formatter
 * Converts a JS Date object into a readable string (e.g., "12 Jan 2025, 10:30 AM")
 */
const formatDate = (date) => {
    if(!date) return 'Lifetime / Never';
    return moment(date).format('DD MMM YYYY, h:mm A');
};

// =================================================================================================
// PART 4: DATABASE SCHEMA DEFINITIONS (MONGOOSE)
// =================================================================================================

// 4.1 Database Connection Initialization
mongoose.connect(MONGO_URI)
    .then(() => {
        Logger.db('--------------------------------------------------');
        Logger.db(' Successfully connected to MongoDB Atlas Cluster');
        Logger.db(` Database Name: SnowmanAdventure`);
        Logger.db(' Connection State: OPEN');
        Logger.db('--------------------------------------------------');
    })
    .catch(err => {
        Logger.error('CRITICAL: MongoDB Connection Failed!');
        Logger.error(`Reason: ${err.message}`);
        // We do not exit process to allow auto-recovery
    });

// 4.2 User Schema (Platform Users)
// Stores data for users who use Laga Host to manage bots.
const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true, index: true },
    username: { type: String, default: 'Unknown' },
    firstName: { type: String, default: 'User' },
    photoUrl: { type: String, default: '' },
    
    // Subscription Data
    plan: { type: String, default: 'Free', enum: ['Free', 'Pro', 'VIP'] },
    planExpiresAt: { type: Date, default: null },
    
    // Resource Limits
    botLimit: { type: Number, default: 1 },
    
    // Rewards & Referrals
    referrals: { type: Number, default: 0 },
    referredBy: { type: String, default: null },
    
    // Activity Tracking
    joinedAt: { type: Date, default: Date.now },
    lastActive: { type: Date, default: Date.now },
    isBanned: { type: Boolean, default: false },
    banReason: { type: String, default: '' }
});

// 4.3 Bot Schema (Hosted Instances)
// Stores configuration and code for every bot created on the platform.
const botSchema = new mongoose.Schema({
    ownerId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    token: { type: String, required: true, unique: true, trim: true },
    
    // Operational State
    status: { 
        type: String, 
        default: 'STOPPED', 
        enum: ['RUNNING', 'STOPPED', 'ERROR', 'SUSPENDED', 'MAINTENANCE'] 
    },
    
    // The "Brain" (Stored Logic)
    // Keys are command names (e.g., 'start'), Values are JS code strings.
    commands: { type: Object, default: {} },
    
    // Environment Variables (Key-Value pairs for secrets)
    envVars: { type: Object, default: {} },
    
    // Performance Statistics
    startedAt: { type: Date, default: null },
    restartCount: { type: Number, default: 0 },
    lastError: { type: String, default: '' },
    
    // Flags
    isFirstLive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

// 4.4 End User Schema (Audience)
// Tracks users who interact with the hosted bots. Crucial for "Client User" broadcasting.
const endUserSchema = new mongoose.Schema({
    tgId: { type: String, required: true },
    botId: { type: String, required: true, index: true },
    username: String,
    firstName: String,
    interactedAt: { type: Date, default: Date.now },
    blockedBot: { type: Boolean, default: false }
});
// Compound Index: A user is unique PER bot instance.
endUserSchema.index({ tgId: 1, botId: 1 }, { unique: true });

// 4.5 Payment Schema (Transaction Logs)
// Audit trail for all financial transactions.
const paymentSchema = new mongoose.Schema({
    userId: String,
    username: String,
    plan: String,
    amount: Number,
    trxId: String,
    method: String, // 'manual', 'referral', 'bkash', 'nagad'
    status: { 
        type: String, 
        default: 'PENDING', 
        enum: ['PENDING', 'APPROVED', 'DECLINED'] 
    },
    adminNote: String,
    processedAt: Date,
    createdAt: { type: Date, default: Date.now }
});

// 4.6 Audit Log Schema (Security & Debugging)
// Tracks critical actions taken by Admins or Systems.
const auditLogSchema = new mongoose.Schema({
    action: String,      // e.g., 'DELETE_BOT', 'APPROVE_PAYMENT'
    executorId: String,  // Who did it
    targetId: String,    // Affected ID
    details: String,     // JSON String or Description
    timestamp: { type: Date, default: Date.now }
});

// 4.7 Broadcast Session Schema (Persistence)
// Ensures broadcast state is saved if server restarts during composition.
const broadcastSessionSchema = new mongoose.Schema({
    adminId: { type: String, required: true, unique: true },
    step: { type: String, default: 'MENU' }, // MENU, AWAIT_IMAGE, AWAIT_TEXT, AWAIT_BUTTON
    data: {
        text: { type: String, default: '' },
        photo: { type: String, default: '' },
        buttons: { type: Array, default: [] } // Array of { text, url }
    },
    updatedAt: { type: Date, default: Date.now }
});

// Initialize Models
const UserModel = mongoose.model('User', userSchema);
const BotModel = mongoose.model('Bot', botSchema);
const EndUserModel = mongoose.model('EndUser', endUserSchema);
const PaymentModel = mongoose.model('Payment', paymentSchema);
const AuditModel = mongoose.model('AuditLog', auditLogSchema);
const BroadcastSession = mongoose.model('BroadcastSession', broadcastSessionSchema);

// =================================================================================================
// PART 5: IN-MEMORY STATE MANAGEMENT
// =================================================================================================

// 5.1 Active Bot Instances
// Maps BotID -> Telegraf Object.
// This is where the running bots live in RAM.
let activeBotInstances = {}; 

// =================================================================================================
// PART 6: SERVER MIDDLEWARE & CONFIGURATION
// =================================================================================================

// 6.1 Enable Cross-Origin Resource Sharing
// Allows the Frontend hosted on a different domain to access this API.
app.use(cors()); 

// 6.2 Body Parsers
// Increase limit to 100mb to handle large code saves or base64 data.
app.use(bodyParser.json({ limit: '100mb' })); 
app.use(bodyParser.urlencoded({ extended: true }));

// 6.3 Static File Serving
// Serves the 'public' folder where the compiled Frontend resides.
app.use(express.static(path.join(__dirname, 'public'))); 

// 6.4 Custom Logging Middleware for API
app.use((req, res, next) => {
    // Only log API requests, ignore static assets
    if (req.path.startsWith('/api')) {
        // Logger.info(`API Request: ${req.method} ${req.path} | IP: ${req.ip}`);
    }
    next();
});

// 6.5 Initialize Main Admin Bot
// This is the bot that users interact with directly.
const mainBot = new Telegraf(ADMIN_CONFIG.token);

// =================================================================================================
// PART 7: CORE BUSINESS LOGIC (SUBSCRIPTIONS & SECURITY)
// =================================================================================================

/**
 * 7.1 Subscription Enforcer
 * Checks if a user's plan has expired.
 * If expired: Downgrades to Free, stops excess bots, and notifies user.
 * 
 * @param {Object} user - The Mongoose User Document
 * @returns {Promise<Object>} - The Updated User Document
 */
async function enforceSubscriptionLogic(user) {
    // If user is already Free, no need to check expiry
    if (user.plan === 'Free') return user;

    const now = new Date();
    
    // Check Expiry Date
    if (user.planExpiresAt && now > new Date(user.planExpiresAt)) {
        Logger.warn(`Subscription Expired for User: ${user.firstName} (${user.userId})`);

        // 1. Downgrade to Free
        const oldPlan = user.plan;
        user.plan = 'Free';
        user.botLimit = PLAN_LIMITS['Free'].botLimit;
        user.planExpiresAt = null; // Reset expiry
        await user.save();

        // 2. Log Audit
        await AuditModel.create({
            action: 'PLAN_EXPIRED',
            executorId: 'SYSTEM',
            targetId: user.userId,
            details: `Downgraded from ${oldPlan} to Free`
        });

        // 3. Notify User
        try {
            await mainBot.telegram.sendMessage(user.userId, 
                `⚠️ <b>Subscription Expired</b>\n\n` +
                `Your <b>${oldPlan}</b> plan has expired.\n` +
                `You have been moved to the <b>Free Plan</b>.\n\n` +
                `System is now enforcing Free Plan limits. Excess bots will be stopped.`, 
                { parse_mode: 'HTML' }
            );
        } catch(e) {}

        // 4. Stop Excess Bots
        const bots = await BotModel.find({ ownerId: user.userId });
        const allowedLimit = PLAN_LIMITS['Free'].botLimit;

        if (bots.length > allowedLimit) {
            Logger.secure(`Enforcing limits for ${user.userId}. Stopping excess bots.`);
            
            // Iterate from the limit to the end of the array
            for (let i = allowedLimit; i < bots.length; i++) {
                const bId = bots[i]._id.toString();
                
                // Stop in RAM
                if (activeBotInstances[bId]) {
                    try { activeBotInstances[bId].stop(); } catch(e){}
                    delete activeBotInstances[bId];
                }
                
                // Update DB Status
                bots[i].status = 'STOPPED';
                await bots[i].save();
            }
        }
    }
    return user;
}

// =================================================================================================
// PART 8: THE SANDBOX ENGINE (BOT HOSTING CORE)
// =================================================================================================

/**
 * 8.1 Bot Launcher
 * Spins up a Telegraf instance for a user-created bot.
 * Creates a secure evaluation context (Sandbox) for dynamic code execution.
 * 
 * @param {Object} botDoc - The MongoDB document of the bot
 * @returns {Promise<Object>} Result { success: boolean, message: string }
 */
async function launchBotInstance(botDoc) {
    const botId = botDoc._id.toString();

    // Prevent duplicate launch
    if (activeBotInstances[botId]) {
        return { success: true, message: 'Instance already running.' };
    }

    try {
        Logger.bot(`Initializing Engine: ${botDoc.name} (${botId})`);

        // 1. Initialize Instance
        const bot = new Telegraf(botDoc.token);

        // 2. Clear Webhook (Force Polling Mode)
        // Hosted bots must use polling because we don't have unique domains for them
        try { await bot.telegram.deleteWebhook(); } catch (e) {}

        // 3. Error Trap (Prevent Server Crash)
        // If a child bot crashes, it should not bring down the main server
        bot.catch((err, ctx) => {
            Logger.error(`[Child Bot ${botDoc.name}] Error: ${err.message}`);
            // Update stats
            BotModel.findByIdAndUpdate(botId, { lastError: err.message }).exec();
        });

        // 4. Global Middleware: Analytics & User Tracking
        // This middleware runs for EVERY message received by the hosted bot
        bot.use(async (ctx, next) => {
            if(ctx.from) {
                // Upsert EndUser (Fire & Forget for speed)
                EndUserModel.updateOne(
                    { tgId: ctx.from.id.toString(), botId: botId },
                    { 
                        $set: { 
                            username: ctx.from.username || 'unknown', 
                            firstName: ctx.from.first_name || 'unknown',
                            interactedAt: new Date()
                        }
                    },
                    { upsert: true }
                ).exec().catch(() => {});
            }
            return next();
        });

        // 5. THE DYNAMIC LOGIC HANDLER
        // This is where user code is executed
        bot.on('message', async (ctx) => {
            if (!ctx.message.text) return;
            const text = ctx.message.text;
            let commandToExec = null;

            // Logic A: Standard Commands (/start, /help)
            if (text.startsWith('/')) {
                const cmdName = text.substring(1).split(' ')[0];
                // Lookup code in DB document (memory copy)
                commandToExec = botDoc.commands[cmdName];
            } 
            // Logic B: Text Matches (Menu Buttons)
            // If user types "Support" and there is a command named "Support", run it.
            else if (botDoc.commands[text]) {
                commandToExec = botDoc.commands[text];
            }

            if (commandToExec) {
                try {
                    // ⚠️ SANDBOX CONTEXT PREPARATION ⚠️
                    // We define a function that takes secure parameters.
                    // We DO NOT pass 'process', 'require', or 'mongoose' to prevent hacking.
                    
                    const sandboxFn = new Function(
                        'ctx', 'bot', 'Markup', 'axios', 'moment', 'crypto',
                        `
                        try {
                            // --- USER CODE START ---
                            ${commandToExec}
                            // --- USER CODE END ---
                        } catch (runtimeError) {
                            console.error('Runtime Error:', runtimeError.message);
                            ctx.reply('⚠️ <b>Bot Logic Error:</b>\\n' + runtimeError.message, { parse_mode: 'HTML' }).catch(e => {});
                        }
                        `
                    );

                    // Execute Sandbox
                    sandboxFn(ctx, bot, Markup, axios, moment, crypto);

                } catch (syntaxError) {
                    ctx.reply(`❌ <b>System Syntax Error:</b>\n${syntaxError.message}`, { parse_mode: 'HTML' });
                }
            }
        });

        // 6. Handle Inline Button Callbacks
        bot.on('callback_query', async (ctx) => {
            const data = ctx.callbackQuery.data;
            // Convention: Look for command named same as callback data
            if (botDoc.commands[data]) {
                try {
                     const sandboxFn = new Function('ctx', 'bot', 'Markup', 'axios', 'moment', `try { ${botDoc.commands[data]} } catch(e){}`);
                     sandboxFn(ctx, bot, Markup, axios, moment);
                     await ctx.answerCbQuery();
                } catch(e) {}
            }
        });

        // 7. Start Polling
        await bot.launch({ dropPendingUpdates: true });
        
        // 8. Update State
        activeBotInstances[botId] = bot;
        
        // 9. Update Database Status
        if (botDoc.isFirstLive) {
            botDoc.isFirstLive = false;
            await botDoc.save();
        }

        Logger.bot(`Started: ${botDoc.name} (${botId})`);
        return { success: true };

    } catch (error) {
        Logger.error(`Failed to launch ${botDoc.name}: ${error.message}`);
        return { success: false, message: 'Invalid Token or Network Error' };
    }
}

// =================================================================================================
// PART 9: API ENDPOINTS (FRONTEND COMMUNICATION)
// =================================================================================================

// 9.1 Fetch Bots & User Data
app.post('/api/bots', async (req, res) => {
    try {
        const { userId, username, firstName } = req.body;
        if (!userId) return res.status(400).json({ success: false, message: 'UserID Required' });

        // User Sync
        let user = await UserModel.findOne({ userId });
        if (!user) {
            user = await UserModel.create({ userId, username, firstName });
            // Notify Admin of new user
            mainBot.telegram.sendMessage(ADMIN_CONFIG.adminId, `👤 <b>New User Joined:</b> ${firstName} (@${username})`, { parse_mode: 'HTML' }).catch(e=>{});
        } else {
            // Update Activity
            user.lastActive = new Date();
            user.username = username || user.username;
            user.firstName = firstName || user.firstName;
            await user.save();
        }

        // Subscription Check
        user = await enforceSubscriptionLogic(user);

        // Fetch Bots
        const bots = await BotModel.find({ ownerId: userId }).sort({ createdAt: -1 });

        res.json({
            success: true,
            user: { ...user.toObject(), expireDate: user.planExpiresAt },
            bots
        });

    } catch (e) {
        Logger.error(`/api/bots Error: ${e.message}`);
        res.status(500).json({ success: false });
    }
});

// 9.2 Create New Bot
app.post('/api/createBot', async (req, res) => {
    const { token, name, userId } = req.body;

    try {
        const user = await UserModel.findOne({ userId });
        const botCount = await BotModel.countDocuments({ ownerId: userId });

        // Limit Check
        if (botCount >= user.botLimit) {
            return res.json({ success: false, message: `Limit Reached! (${user.botLimit} Max). Upgrade Plan.` });
        }

        // Token Format Check
        if (!isValidBotToken(token)) {
            return res.json({ success: false, message: 'Invalid Bot Token Format.' });
        }

        // Duplicate Check
        const existing = await BotModel.findOne({ token });
        if (existing) {
            return res.json({ success: false, message: 'Token already in use by another user.' });
        }

        const newBot = await BotModel.create({
            ownerId: userId,
            name: name.trim(),
            token: token.trim(),
            status: 'STOPPED'
        });

        Logger.success(`Bot Created: ${name} by ${userId}`);
        res.json({ success: true, bot: newBot });

    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// 9.3 Toggle Bot Power (Start/Stop)
app.post('/api/toggleBot', async (req, res) => {
    const { botId, action } = req.body;

    try {
        const bot = await BotModel.findById(botId);
        if (!bot) return res.json({ success: false, message: 'Bot not found' });

        if (action === 'start') {
            // Re-check plan limits before starting
            const user = await UserModel.findOne({ userId: bot.ownerId });
            
            // Logic for Free Users: Only 1 bot running allowed? 
            // Currently enforced by 'botLimit', but you can add stricter checks here.
            
            const result = await launchBotInstance(bot);
            if (result.success) {
                bot.status = 'RUNNING';
                bot.startedAt = new Date();
                await bot.save();
                res.json({ success: true, startedAt: bot.startedAt });
            } else {
                res.json({ success: false, message: result.message });
            }
        } else {
            // STOP
            if (activeBotInstances[botId]) {
                try { activeBotInstances[botId].stop(); } catch(e) {}
                delete activeBotInstances[botId];
            }
            bot.status = 'STOPPED';
            bot.startedAt = null;
            await bot.save();
            res.json({ success: true });
        }
    } catch (e) {
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
});

// 9.4 Restart Bot (Hard Reset)
app.post('/api/restartBot', async (req, res) => {
    const { botId } = req.body;
    try {
        // Kill existing instance
        if (activeBotInstances[botId]) {
            try { activeBotInstances[botId].stop(); } catch(e){}
            delete activeBotInstances[botId];
        }
        
        const bot = await BotModel.findById(botId);
        const result = await launchBotInstance(bot);
        
        if (result.success) {
            bot.status = 'RUNNING';
            bot.startedAt = new Date();
            bot.restartCount = (bot.restartCount || 0) + 1;
            await bot.save();
            res.json({ success: true });
        } else {
            res.json({ success: false, message: result.message });
        }
    } catch(e) {
        res.json({ success: false });
    }
});

// 9.5 Delete Bot
app.post('/api/deleteBot', async (req, res) => {
    const { botId } = req.body;
    try {
        if (activeBotInstances[botId]) {
            try { activeBotInstances[botId].stop(); } catch(e){}
            delete activeBotInstances[botId];
        }
        await BotModel.findByIdAndDelete(botId);
        // Clean up end users data to free space
        await EndUserModel.deleteMany({ botId });
        
        Logger.warn(`Bot Deleted: ${botId}`);
        res.json({ success: true });
    } catch(e) {
        res.json({ success: false });
    }
});

// 9.6 Editor: Get/Save Commands
app.post('/api/getCommands', async (req, res) => {
    try {
        const bot = await BotModel.findById(req.body.botId);
        res.json(bot ? bot.commands : {});
    } catch(e) { res.json({}); }
});

app.post('/api/saveCommand', async (req, res) => {
    const { botId, command, code } = req.body;
    // Allow spaces in keys for Menu Text matching
    const cleanKey = command.startsWith('/') ? command.substring(1) : command;
    
    try {
        await BotModel.findByIdAndUpdate(botId, { 
            $set: { [`commands.${cleanKey}`]: code } 
        });
        res.json({ success: true });
    } catch(e) { res.json({ success: false }); }
});

app.post('/api/deleteCommand', async (req, res) => {
    const { botId, command } = req.body;
    const cleanKey = command.startsWith('/') ? command.substring(1) : command;
    
    try {
        await BotModel.findByIdAndUpdate(botId, { 
            $unset: { [`commands.${cleanKey}`]: "" } 
        });
        res.json({ success: true });
    } catch(e) { res.json({ success: false }); }
});

// 9.7 Payment Processing
app.post('/api/submit-payment', async (req, res) => {
    const { trxId, plan, amount, userId, user, method } = req.body;

    Logger.payment(`Request: ${user} - ${plan} (${method})`);

    // Referral Redemption (Automatic)
    if (method === 'referral') {
        const dbUser = await UserModel.findOne({ userId });
        const cost = PLAN_LIMITS[plan].pricePoints;
        
        if (dbUser.referrals < cost) {
            return res.json({ success: false, message: "Insufficient Points" });
        }

        const expiry = new Date(); 
        expiry.setDate(expiry.getDate() + 30);
        
        dbUser.plan = plan;
        dbUser.botLimit = PLAN_LIMITS[plan].botLimit;
        dbUser.planExpiresAt = expiry;
        dbUser.referrals -= cost;
        await dbUser.save();

        Logger.success(`User ${user} upgraded to ${plan} via Points`);
        return res.json({ success: true });
    }

    // Manual Payment (Requires Approval)
    try {
        const payment = await PaymentModel.create({
            userId, username: user, plan, amount, trxId, method
        });

        // Notify Admin via Telegram
        mainBot.telegram.sendMessage(ADMIN_CONFIG.adminId, 
            `💰 <b>PAYMENT VERIFICATION REQUIRED</b>\n\n` +
            `👤 <b>User:</b> @${user} (<code>${userId}</code>)\n` +
            `💎 <b>Plan:</b> ${plan}\n` +
            `💵 <b>Amount:</b> ${amount} BDT\n` +
            `🧾 <b>TrxID:</b> <code>${trxId}</code>\n` +
            `📅 <b>Method:</b> ${method}`,
            {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '✅ Approve', callback_data: `approve_pay:${userId}:${plan}:${payment._id}` },
                            { text: '❌ Decline', callback_data: `decline_pay:${userId}:${payment._id}` }
                        ]
                    ]
                }
            }
        );

        res.json({ success: true });

    } catch (e) {
        Logger.error(`Payment Error: ${e.message}`);
        res.json({ success: false, message: 'Server Error' });
    }
});

// =================================================================================================
// PART 10: ADVANCED BROADCAST SYSTEM ("COMPOSER" LOGIC)
// =================================================================================================

/**
 * 10.1 Helper: Get Broadcast Session
 * Retrieves or initializes the draft for an admin.
 */
async function getBroadcastSession(adminId) {
    let session = await BroadcastSession.findOne({ adminId });
    if (!session) {
        session = await BroadcastSession.create({ adminId });
    }
    return session;
}

/**
 * 10.2 Helper: Generate Main Composer Menu
 * Creates the dynamic Inline Keyboard based on current draft state.
 */
function getComposerMenu(data) {
    const hasPhoto = !!data.photo;
    const hasText = !!data.text;
    const btnCount = data.buttons.length;

    // Button Labels
    const lblImg = hasPhoto ? '✅ Image Set' : '📷 Add Image';
    const lblTxt = hasText ? '✅ Text Set' : '📝 Add Text';
    const lblBtn = btnCount > 0 ? `✅ Buttons (${btnCount})` : '🔗 Add Button';
    
    // Send is only enabled if Text or Photo exists
    const canSend = hasPhoto || hasText;
    const lblSend = canSend ? '🚀 SEND BROADCAST' : '🔒 (Empty)';
    const cbSend = canSend ? 'cast_select_audience' : 'cast_ignore';

    return Markup.inlineKeyboard([
        [
            Markup.button.callback(lblImg, 'cast_step_image'),
            Markup.button.callback(lblTxt, 'cast_step_text')
        ],
        [
            Markup.button.callback(lblBtn, 'cast_step_button')
        ],
        [
            Markup.button.callback('👁️ Preview', 'cast_preview'),
            Markup.button.callback('🔄 Reset', 'cast_reset')
        ],
        [
            Markup.button.callback('❌ Cancel', 'cast_cancel')
        ],
        [
            Markup.button.callback(lblSend, cbSend)
        ]
    ]);
}

/**
 * 10.3 Command: /broadcast
 * Starts the composer workflow.
 */
mainBot.command('broadcast', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_CONFIG.adminId) return;
    
    // Initialize Session DB
    const session = await getBroadcastSession(ctx.from.id);
    session.step = 'MENU';
    await session.save();

    await ctx.reply(
        `📢 <b>Broadcast Composer Studio</b>\n\n` +
        `Build your message step-by-step using the buttons below.\n` +
        `You can combine Text, Image, and Links.`,
        { parse_mode: 'HTML', ...getComposerMenu(session.data) }
    );
});

// -------------------------------------------------------------------------------------------------
// STEP 1: SET IMAGE
// -------------------------------------------------------------------------------------------------
mainBot.action('cast_step_image', async (ctx) => {
    const session = await getBroadcastSession(ctx.from.id);
    session.step = 'AWAIT_IMAGE';
    await session.save();

    await ctx.deleteMessage();
    await ctx.reply(
        `📷 <b>Upload Image</b>\n\n` +
        `Please send the <b>Photo</b> you want to attach.\n` +
        `<i>Send /cancel to return.</i>`,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Back', 'cast_back_menu')]])
    );
});

// -------------------------------------------------------------------------------------------------
// STEP 2: SET TEXT
// -------------------------------------------------------------------------------------------------
mainBot.action('cast_step_text', async (ctx) => {
    const session = await getBroadcastSession(ctx.from.id);
    session.step = 'AWAIT_TEXT';
    await session.save();

    await ctx.deleteMessage();
    await ctx.reply(
        `📝 <b>Enter Message Text</b>\n\n` +
        `You can use HTML tags:\n` +
        `• &lt;b&gt;Bold&lt;/b&gt;\n` +
        `• &lt;i&gt;Italic&lt;/i&gt;\n` +
        `• &lt;code&gt;Mono&lt;/code&gt;\n\n` +
        `<i>Send the text now...</i>`,
        { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Back', 'cast_back_menu')]]) }
    );
});

// -------------------------------------------------------------------------------------------------
// STEP 3: SET BUTTONS
// -------------------------------------------------------------------------------------------------
mainBot.action('cast_step_button', async (ctx) => {
    const session = await getBroadcastSession(ctx.from.id);
    session.step = 'AWAIT_BUTTON';
    await session.save();

    await ctx.deleteMessage();
    await ctx.reply(
        `🔗 <b>Add Inline Button</b>\n\n` +
        `Send the button in this format:\n` +
        `<code>Button Name - https://link.com</code>\n\n` +
        `Example:\n` +
        `<i>Join Channel - https://t.me/lagatech</i>`,
        { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Back', 'cast_back_menu')]]) }
    );
});

// -------------------------------------------------------------------------------------------------
// HANDLER: GLOBAL TEXT/PHOTO LISTENER (THE WIZARD LOGIC)
// -------------------------------------------------------------------------------------------------
mainBot.on(['text', 'photo'], async (ctx, next) => {
    const userId = ctx.from.id.toString();
    
    // Security: Only Admin
    if (userId !== ADMIN_CONFIG.adminId) return next();

    const session = await BroadcastSession.findOne({ adminId: userId });
    // If not in a wizard step, ignore
    if (!session || session.step === 'MENU') return next();

    // HANDLE CANCEL
    if (ctx.message.text === '/cancel') {
        session.step = 'MENU';
        await session.save();
        return ctx.reply("📢 <b>Broadcast Composer</b>", { parse_mode: 'HTML', ...getComposerMenu(session.data) });
    }

    // --- LOGIC: SAVE IMAGE ---
    if (session.step === 'AWAIT_IMAGE') {
        if (!ctx.message.photo) return ctx.reply("❌ That is not a photo. Please send a photo.");
        
        // Telegram sends multiple sizes, get the largest (last one)
        const photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        
        session.data.photo = photoId;
        session.step = 'MENU';
        await session.save();

        await ctx.reply("✅ <b>Image Saved Successfully!</b>", { parse_mode: 'HTML' });
        // Return to menu
        return ctx.reply("📢 <b>Broadcast Composer</b>", { parse_mode: 'HTML', ...getComposerMenu(session.data) });
    }

    // --- LOGIC: SAVE TEXT ---
    if (session.step === 'AWAIT_TEXT') {
        if (!ctx.message.text) return ctx.reply("❌ Please send text only.");
        
        session.data.text = ctx.message.text;
        session.step = 'MENU';
        await session.save();

        await ctx.reply("✅ <b>Text Saved Successfully!</b>", { parse_mode: 'HTML' });
        return ctx.reply("📢 <b>Broadcast Composer</b>", { parse_mode: 'HTML', ...getComposerMenu(session.data) });
    }

    // --- LOGIC: SAVE BUTTON ---
    if (session.step === 'AWAIT_BUTTON') {
        if (!ctx.message.text) return ctx.reply("❌ Please send text format.");
        
        const parts = ctx.message.text.split('-');
        if (parts.length < 2) {
            return ctx.reply("❌ Invalid Format!\nUse: <code>Name - Link</code>", { parse_mode: 'HTML' });
        }
        
        const name = parts[0].trim();
        const url = parts.slice(1).join('-').trim();
        
        // Basic URL check
        if (!url.startsWith('http')) return ctx.reply("❌ URL must start with http or https");

        session.data.buttons.push({ text: name, url: url });
        session.step = 'MENU';
        await session.save();

        await ctx.reply(`✅ <b>Button Added:</b> ${name}`, { parse_mode: 'HTML' });
        return ctx.reply("📢 <b>Broadcast Composer</b>", { parse_mode: 'HTML', ...getComposerMenu(session.data) });
    }

    return next();
});

// -------------------------------------------------------------------------------------------------
// ACTIONS: MENU NAVIGATION
// -------------------------------------------------------------------------------------------------

mainBot.action('cast_back_menu', async (ctx) => {
    const session = await getBroadcastSession(ctx.from.id);
    session.step = 'MENU';
    await session.save();
    
    await ctx.deleteMessage();
    await ctx.reply("📢 <b>Broadcast Composer</b>", { parse_mode: 'HTML', ...getComposerMenu(session.data) });
});

mainBot.action('cast_reset', async (ctx) => {
    const session = await getBroadcastSession(ctx.from.id);
    session.data = { text: '', photo: '', buttons: [] };
    session.step = 'MENU';
    await session.save();

    await ctx.answerCbQuery("Data Cleared");
    await ctx.editMessageText("📢 <b>Broadcast Composer</b>\n\n<i>Draft Cleared.</i>", { parse_mode: 'HTML', ...getComposerMenu(session.data) });
});

mainBot.action('cast_cancel', async (ctx) => {
    await BroadcastSession.findOneAndDelete({ adminId: ctx.from.id });
    await ctx.deleteMessage();
    await ctx.reply("❌ Broadcast Cancelled.");
});

mainBot.action('cast_preview', async (ctx) => {
    const session = await getBroadcastSession(ctx.from.id);
    const { text, photo, buttons } = session.data;

    // Build Keyboard
    const kb = buttons.length > 0 ? Markup.inlineKeyboard(buttons.map(b => [Markup.button.url(b.text, b.url)])) : null;

    try {
        if (photo) {
            await ctx.replyWithPhoto(photo, { caption: text || '', parse_mode: 'HTML', ...kb });
        } else if (text) {
            await ctx.reply(text, { parse_mode: 'HTML', ...kb });
        } else {
            return ctx.answerCbQuery("Nothing to preview!");
        }
    } catch(e) {
        return ctx.reply(`⚠️ Preview Error: ${e.message}`);
    }
});

// -------------------------------------------------------------------------------------------------
// STEP 4: AUDIENCE SELECTION (FINAL CONFIRMATION)
// -------------------------------------------------------------------------------------------------
mainBot.action('cast_select_audience', async (ctx) => {
    const session = await getBroadcastSession(ctx.from.id);
    
    // Safety Check
    if (!session.data.text && !session.data.photo) {
        return ctx.answerCbQuery("Cannot send empty message!");
    }

    await ctx.deleteMessage();
    await ctx.reply(
        `🎯 <b>Select Target Audience</b>\n\n` +
        `👤 <b>Platform Users (My Users):</b>\n` +
        `People who interact with THIS bot (@${ctx.botInfo.username}).\n\n` +
        `👥 <b>Hosted Bot Users (Client Users):</b>\n` +
        `People who interact with bots HOSTED on Laga Host.\n\n` +
        `⚠️ <i>This action cannot be undone.</i>`,
        {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '👤 My Users (Platform)', callback_data: 'cast_execute_main' },
                        { text: '👥 Client Users (Hosted)', callback_data: 'cast_execute_client' }
                    ],
                    [{ text: '🔙 Edit Message', callback_data: 'cast_back_menu' }]
                ]
            }
        }
    );
});

// -------------------------------------------------------------------------------------------------
// EXECUTION ENGINE: NON-BLOCKING BROADCAST
// -------------------------------------------------------------------------------------------------

/**
 * Executes the broadcast in a non-blocking background process.
 * Uses setImmediate to prevent Event Loop Starvation.
 */
async function runBroadcastEngine(ctx, targetType) {
    const session = await getBroadcastSession(ctx.from.id);
    const { text, photo, buttons } = session.data;

    // Build Keyboard once
    const keyboard = buttons.length > 0 ? 
        Markup.inlineKeyboard(buttons.map(b => [Markup.button.url(b.text, b.url)])) : null;

    // Clear Draft
    await BroadcastSession.findOneAndDelete({ adminId: ctx.from.id });

    // Inform Admin
    await ctx.deleteMessage();
    const statusMsg = await ctx.reply(
        `🚀 <b>Broadcast Started!</b>\n` +
        `Target: ${targetType === 'main' ? 'PLATFORM USERS' : 'HOSTED CLIENTS'}\n` +
        `<i>You can continue using the bot. I will notify you when done.</i>`,
        { parse_mode: 'HTML' }
    );

    // --- BACKGROUND PROCESS START ---
    (async () => {
        let sent = 0;
        let failed = 0;
        let blocked = 0;

        // Common Sender Function
        const dispatch = async (botInstance, targetId) => {
            try {
                if (photo) {
                    await botInstance.telegram.sendPhoto(targetId, photo, { caption: text || '', parse_mode: 'HTML', ...keyboard });
                } else {
                    await botInstance.telegram.sendMessage(targetId, text, { parse_mode: 'HTML', ...keyboard });
                }
                return 'OK';
            } catch (e) {
                if (e.code === 403 || e.description.includes('blocked')) return 'BLOCK';
                return 'FAIL';
            }
        };

        if (targetType === 'main') {
            // Stream Database Cursor to avoid RAM overflow
            const cursor = UserModel.find().cursor();
            
            for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
                const res = await dispatch(mainBot, doc.userId);
                
                if (res === 'OK') sent++;
                else if (res === 'BLOCK') blocked++;
                else failed++;

                // Yield to Event Loop every 20 messages to keep server responsive
                if (sent % 20 === 0) {
                    await sleep(50); // Small throttle
                }
            }
        } else {
            // Client Broadcast: Iterate Active Bots
            const bots = await BotModel.find({ status: 'RUNNING' });
            
            for (const bot of bots) {
                // Get or Init Sender
                let sender = activeBotInstances[bot._id.toString()];
                if(!sender) {
                    try { sender = new Telegraf(bot.token); } catch(e) { continue; }
                }

                // Get Users for this bot
                const endUsers = await EndUserModel.find({ botId: bot._id.toString() });
                
                for (const u of endUsers) {
                    // Skip if user is Admin or Bot Owner (optional)
                    if(u.tgId === ADMIN_CONFIG.adminId || u.tgId === bot.ownerId) continue;
                    
                    const res = await dispatch(sender, u.tgId);
                    
                    if (res === 'OK') sent++;
                    else if (res === 'BLOCK') {
                        blocked++;
                        // Optionally remove blocked users to clean DB
                        // await EndUserModel.findByIdAndDelete(u._id);
                    }
                    else failed++;

                    // Throttling for Clients
                    if (sent % 10 === 0) await sleep(100); 
                }
            }
        }

        // FINAL REPORT
        Logger.broadcast(`Broadcast Finished. Sent: ${sent}, Blocked: ${blocked}`);
        
        try {
            await mainBot.telegram.editMessageText(
                ctx.chat.id, 
                statusMsg.message_id, 
                null,
                `✅ <b>Broadcast Report</b>\n\n` +
                `📨 <b>Delivered:</b> ${sent}\n` +
                `🚫 <b>Blocked:</b> ${blocked}\n` +
                `❌ <b>Failed:</b> ${failed}\n\n` +
                `<i>Job Completed at ${moment().format('h:mm A')}</i>`,
                { parse_mode: 'HTML' }
            );
        } catch(e){}

    })(); // --- BACKGROUND PROCESS END ---
}

mainBot.action('cast_execute_main', (ctx) => runBroadcastEngine(ctx, 'main'));
mainBot.action('cast_execute_client', (ctx) => runBroadcastEngine(ctx, 'client'));
mainBot.action('cast_ignore', (ctx) => ctx.answerCbQuery('Action disabled'));

// =================================================================================================
// PART 11: ADMIN BOT HANDLERS & MENU LOGIC
// =================================================================================================

// 11.1 Start Command
mainBot.command('start', async (ctx) => {
    const args = ctx.message.text.split(' ');
    const referrer = args[1];

    let user = await UserModel.findOne({ userId: ctx.from.id.toString() });
    
    if (!user) {
        // Create New User
        user = await UserModel.create({
            userId: ctx.from.id.toString(),
            firstName: ctx.from.first_name,
            username: ctx.from.username,
            referredBy: referrer && referrer !== ctx.from.id.toString() ? referrer : null
        });
        
        Logger.info(`New User: ${ctx.from.first_name}`);

        // Process Referral
        if (user.referredBy) {
            await UserModel.findOneAndUpdate({ userId: user.referredBy }, { $inc: { referrals: 1 } });
            try {
                await mainBot.telegram.sendMessage(user.referredBy, 
                    `🎉 <b>New Referral!</b>\n\n` +
                    `User ${ctx.from.first_name} joined via your link.\n` +
                    `<b>+1 Point</b> added to your balance.`, 
                    { parse_mode: 'HTML' }
                );
            } catch(e){}
        }
    }

    // Main Menu
    const menu = Markup.inlineKeyboard([
        [Markup.button.webApp('🚀 Open Console Dashboard', WEB_APP_URL)],
        [
            Markup.button.url('📢 Channel', ADMIN_CONFIG.channels[0].url),
            Markup.button.url('🆘 Support', ADMIN_CONFIG.support.channelUrl)
        ],
        [Markup.button.callback('📜 My Profile', 'action_profile')]
    ]);

    await ctx.replyWithHTML(
        `👋 <b>Welcome to Laga Host Titanium!</b>\n\n` +
        `The most advanced Telegram Bot Hosting platform.\n` +
        `Deploy, Manage, and Edit your bots effortlessly.\n\n` +
        `👇 <b>Tap below to launch the App:</b>`,
        menu
    );
});

// 11.2 Profile Action
mainBot.action('action_profile', async (ctx) => {
    const user = await UserModel.findOne({ userId: ctx.from.id });
    if (!user) return ctx.answerCbQuery("User not found!");

    const bots = await BotModel.countDocuments({ ownerId: user.userId });
    
    await ctx.editMessageText(
        `👤 <b>User Profile</b>\n\n` +
        `🆔 <b>ID:</b> <code>${user.userId}</code>\n` +
        `💎 <b>Plan:</b> ${user.plan}\n` +
        `🤖 <b>Bots:</b> ${bots} / ${user.botLimit}\n` +
        `💰 <b>Points:</b> ${user.referrals}\n\n` +
        `📅 <b>Expiry:</b> ${formatDate(user.planExpiresAt)}`,
        { 
            parse_mode: 'HTML', 
            reply_markup: {
                inline_keyboard: [[Markup.button.callback('🔙 Back', 'action_back_start')]]
            } 
        }
    );
});

mainBot.action('action_back_start', async (ctx) => {
    const menu = Markup.inlineKeyboard([
        [Markup.button.webApp('🚀 Open Console Dashboard', WEB_APP_URL)],
        [
            Markup.button.url('📢 Channel', ADMIN_CONFIG.channels[0].url),
            Markup.button.url('🆘 Support', ADMIN_CONFIG.support.channelUrl)
        ],
        [Markup.button.callback('📜 My Profile', 'action_profile')]
    ]);
    
    await ctx.editMessageText(
        `👋 <b>Welcome to Laga Host Titanium!</b>\n\n` +
        `The most advanced Telegram Bot Hosting platform.\n` +
        `Deploy, Manage, and Edit your bots effortlessly.\n\n` +
        `👇 <b>Tap below to launch the App:</b>`,
        { parse_mode: 'HTML', ...menu }
    );
});

// 11.3 Admin Stats Command
mainBot.command('stats', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_CONFIG.adminId) return;

    const u = await UserModel.countDocuments();
    const b = await BotModel.countDocuments();
    const running = await BotModel.countDocuments({ status: 'RUNNING' });
    const paid = await UserModel.countDocuments({ plan: { $ne: 'Free' } });
    const endUsers = await EndUserModel.countDocuments();

    ctx.replyWithHTML(
        `📊 <b>System Statistics</b>\n\n` +
        `👤 <b>Users:</b> ${u}\n` +
        `👥 <b>End Users:</b> ${endUsers}\n` +
        `🤖 <b>Bots:</b> ${b}\n` +
        `🟢 <b>Running:</b> ${running}\n` +
        `💎 <b>Premium:</b> ${paid}\n` +
        `💾 <b>RAM:</b> ${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB`
    );
});

// 11.4 Payment Approval/Decline Actions
mainBot.action(/^approve_pay:(.+):(.+):(.+)$/, async (ctx) => {
    const [_, uid, plan, pid] = ctx.match;
    
    const limits = PLAN_LIMITS[plan];
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + limits.validityDays);

    // 1. Upgrade User
    await UserModel.findOneAndUpdate(
        { userId: uid }, 
        { 
            plan: plan, 
            botLimit: limits.botLimit, 
            planExpiresAt: expiry 
        }
    );
    
    // 2. Update Transaction
    await PaymentModel.findByIdAndUpdate(pid, { status: 'APPROVED', processedAt: new Date() });

    // 3. Log Audit
    await AuditModel.create({
        action: 'APPROVE_PAYMENT',
        executorId: ctx.from.id,
        targetId: uid,
        details: `Plan: ${plan}, PID: ${pid}`
    });

    // 4. Update Admin UI
    await ctx.editMessageText(
        `${ctx.callbackQuery.message.text}\n\n✅ <b>APPROVED</b> by ${ctx.from.first_name}`, 
        { parse_mode: 'HTML' }
    );

    // 5. Notify User
    await mainBot.telegram.sendMessage(uid, 
        `✅ <b>Payment Accepted!</b>\n\n` +
        `You have been upgraded to <b>${plan}</b>.\n` +
        `Valid Until: ${formatDate(expiry)}\n\n` +
        `Thank you for supporting Laga Host.`, 
        { parse_mode: 'HTML' }
    );
});

mainBot.action(/^decline_pay:(.+):(.+)$/, async (ctx) => {
    const [_, uid, pid] = ctx.match;
    
    await PaymentModel.findByIdAndUpdate(pid, { status: 'DECLINED', processedAt: new Date() });
    
    await ctx.editMessageText(
        `${ctx.callbackQuery.message.text}\n\n❌ <b>DECLINED</b> by ${ctx.from.first_name}`, 
        { parse_mode: 'HTML' }
    );

    await mainBot.telegram.sendMessage(uid, 
        `❌ <b>Payment Declined</b>\n\n` +
        `The transaction details provided were incorrect or could not be verified.\n` +
        `Please contact admin support if this is an error.`, 
        { parse_mode: 'HTML' }
    );
});

// =================================================================================================
// PART 12: CRON JOBS & AUTOMATED TASKS
// =================================================================================================

// 12.1 Daily Subscription Check (Midnight)
cron.schedule('0 0 * * *', async () => {
    Logger.info('⏰ Running Daily Subscription Check...');
    const now = new Date();
    
    try {
        const expiredUsers = await UserModel.find({ 
            plan: { $ne: 'Free' }, 
            planExpiresAt: { $lt: now } 
        });
        
        Logger.info(`Found ${expiredUsers.length} expired subscriptions.`);

        for (const user of expiredUsers) {
            await enforceSubscriptionLogic(user);
        }
    } catch(e) {
        Logger.error(`Cron Job Error: ${e.message}`);
    }
});

// 12.2 Weekly Cleanup (Sundays)
cron.schedule('0 0 * * 0', async () => {
    Logger.db('Running Weekly Database Cleanup...');
    // Example: Delete unverified payments older than 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    await PaymentModel.deleteMany({ status: 'PENDING', createdAt: { $lt: sevenDaysAgo } });
    // Also clear old audit logs
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    await AuditModel.deleteMany({ timestamp: { $lt: thirtyDaysAgo } });
    
    Logger.db('Cleanup Complete.');
});

// =================================================================================================
// PART 13: SYSTEM STARTUP & RECOVERY
// =================================================================================================

/**
 * 13.1 Startup Sequence
 * 1. Connect DB
 * 2. Restore Active Bots
 * 3. Start Main Bot
 * 4. Start HTTP Server
 */

mongoose.connection.once('open', async () => {
    Logger.info('Initiating Startup Recovery Sequence...');

    // Restore Sessions
    const runningBots = await BotModel.find({ status: 'RUNNING' });
    
    if(runningBots.length > 0) {
        Logger.info(`Found ${runningBots.length} active bots to restore...`);
        
        let restoredCount = 0;
        
        // Use a loop with delay to prevent CPU spike
        for (const bot of runningBots) {
            // Check if owner is still valid (not expired)
            const user = await UserModel.findOne({ userId: bot.ownerId });
            if (user && user.planExpiresAt && new Date() > new Date(user.planExpiresAt)) {
                 bot.status = 'STOPPED';
                 await bot.save();
                 continue;
            }

            const res = await launchBotInstance(bot);
            if(res.success) restoredCount++;
            
            // 50ms delay between launches
            await sleep(50);
        }
        
        Logger.success(`Successfully restored ${restoredCount} / ${runningBots.length} bot sessions.`);
    } else {
        Logger.info('No active bots found. System clean.');
    }
});

// 13.2 Launch Main Bot
mainBot.launch({ dropPendingUpdates: true })
    .then(() => Logger.success(`Main Admin Bot (@${ADMIN_CONFIG.token.split(':')[0]}) is Online`))
    .catch(err => Logger.error(`Main Bot Failed to Launch: ${err.message}`));

// 13.3 Graceful Shutdown Handling
const gracefulShutdown = (signal) => {
    Logger.warn(`Received ${signal}. Shutting down safely...`);
    
    // Stop Main Bot
    mainBot.stop(signal);
    
    // Stop All Hosted Bots
    const activeIds = Object.keys(activeBotInstances);
    Logger.bot(`Stopping ${activeIds.length} active instances...`);
    activeIds.forEach(id => {
        try { activeBotInstances[id].stop(signal); } catch(e) {}
    });
    
    // Close DB
    mongoose.connection.close(false, () => {
        Logger.db('Database Disconnected.');
        process.exit(0);
    });
};

process.once('SIGINT', () => gracefulShutdown('SIGINT'));
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));

// 13.4 Start Express Server
app.listen(PORT, () => {
    console.log('\n');
    console.log('===========================================================');
    console.log(` LAGA HOST SERVER v${SYSTEM_VERSION} IS RUNNING`);
    console.log(` PORT: ${PORT}`);
    console.log(` ENV:  ${process.env.NODE_ENV || 'Development'}`);
    console.log('===========================================================');
    console.log('\n');
});
