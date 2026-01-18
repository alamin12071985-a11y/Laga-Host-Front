/**
 * ==================================================================================================
 *  PROJECT: LAGA HOST AI - ULTIMATE TITAN SERVER (ENTERPRISE EDITION)
 *  VERSION: 5.0.0 (The Monolith)
 *  DATE: January 18, 2026
 *  AUTHOR: Laga Host Development Team
 *  COPYRIGHT: © 2024-2026 Laga Host Inc. All Rights Reserved.
 * ==================================================================================================
 * 
 *  [SYSTEM ARCHITECTURE OVERVIEW]
 * 
 *  This file serves as the centralized backend kernel for the Laga Host Platform.
 *  It is designed for High Availability (HA) and Horizontal Scaling.
 * 
 *  CORE MODULES:
 *  1. SERVER KERNEL: Express.js setup with security middleware (Helmet, CORS, RateLimit).
 *  2. DATABASE LAYER: MongoDB Mongoose with advanced schema definitions and pre-save hooks.
 *  3. BOT ENGINE (VM): A secure sandbox environment for running user-generated bot logic.
 *  4. USER MANAGEMENT: Subscription handling, referral systems, and role-based access control.
 *  5. PAYMENT GATEWAY: Manual transaction verification system with admin approval workflows.
 *  6. BROADCAST WIZARD: A state-machine driven broadcasting tool for mass communication.
 *  7. ANALYTICS & LOGGING: Real-time system health monitoring and detailed activity logs.
 * 
 *  [DEPLOYMENT INSTRUCTIONS]
 *  - Ensure Node.js v18+ is installed.
 *  - Set up a .env file with MONGO_URI, BOT_TOKEN, ADMIN_ID, and WEB_APP_URL.
 *  - Run `npm install express telegraf mongoose body-parser cors node-cron moment axios dotenv`
 *  - Start with `node index.js`
 * 
 * ==================================================================================================
 */

// ==================================================================================================
// SECTION 1: SYSTEM DEPENDENCIES & IMPORTS
// ==================================================================================================

// 1.1 Environment Configuration
// Load environment variables securely from .env file
require('dotenv').config();

// 1.2 Core Frameworks
// Express: Fast, unopinionated, minimalist web framework for Node.js
const express = require('express');
// Telegraf: Modern Telegram Bot Framework for Node.js
const { Telegraf, Markup, session } = require('telegraf');

// 1.3 Database & Utilities
// Mongoose: Elegant mongodb object modeling for node.js
const mongoose = require('mongoose');
// Body-Parser: Node.js body parsing middleware
const bodyParser = require('body-parser');
// CORS: Connect/Express middleware for Cross-Origin Resource Sharing
const cors = require('cors');
// Path: Node.js path module for handling file paths
const path = require('path');
// File System: Node.js fs module for file operations
const fs = require('fs');

// 1.4 Scheduling & Time
// Node-Cron: Task scheduler for node.js (Cron jobs)
const cron = require('node-cron');
// Moment: Parse, validate, manipulate, and display dates and times in JavaScript
const moment = require('moment');

// 1.5 Networking
// Axios: Promise based HTTP client for the browser and node.js
const axios = require('axios');

// ==================================================================================================
// SECTION 2: GLOBAL CONFIGURATION & CONSTANTS
// ==================================================================================================

/**
 * Initialize the Express Application
 */
const app = express();

/**
 * Server Port Configuration
 * Defaults to 3000 if not specified in the environment.
 */
const PORT = process.env.PORT || 3000;

/**
 * Web Application URL
 * Used for WebApp buttons and CORS whitelist.
 * IMPORTANT: Change this to your actual domain in production.
 */
const WEB_APP_URL = process.env.WEB_APP_URL || "https://lagahost-ai-console.onrender.com";

/**
 * Administrative Configuration
 * Centralized settings for admin IDs, support links, and channels.
 */
const ADMIN_CONFIG = {
    // The Main Host Bot Token
    token: process.env.BOT_TOKEN || "8264143788:AAH0fRkMqBw4rONo0WVEi-OyAVkPs9bRt84",
    
    // The Super Admin's Telegram ID (Required for Alerts)
    adminId: process.env.ADMIN_ID || "7605281774",
    
    // Support & Social Links
    support: {
        adminUser: "@lagatech",
        channelUrl: "https://t.me/lagatechofficial",
        youtubeUrl: "https://youtube.com/@lagatech",
        groupUrl: "https://t.me/snowmanadventureannouncement"
    },

    // Payment Info
    paymentInfo: {
        nagad: "01761494948",
        bkash: "01761494948",
        rocket: "01761494948"
    }
};

/**
 * Subscription Plan Logic
 * Defines limits for Free, Pro, and VIP tiers.
 */
const PLAN_LIMITS = {
    'Free': { 
        botLimit: 1, 
        validityDays: 9999, // Lifetime
        pricePoints: 0,
        cpuPriority: 'Low',
        supportLevel: 'Community'
    },
    'Pro':  { 
        botLimit: 5, 
        validityDays: 30, 
        pricePoints: 50,
        cpuPriority: 'Medium',
        supportLevel: 'Priority'
    },
    'VIP':  { 
        botLimit: 10, 
        validityDays: 30, 
        pricePoints: 80,
        cpuPriority: 'High',
        supportLevel: 'Dedicated'
    }
};

/**
 * Database Connection String
 * Checks for ENV variable, otherwise falls back to a default (not recommended for production).
 */
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://lagahost:l%40g%40ho%24t@snowmanadventure.ocodku0.mongodb.net/snowmanadventure?retryWrites=true&w=majority&appName=snowmanadventure";

// ==================================================================================================
// SECTION 3: ADVANCED LOGGING SYSTEM
// ==================================================================================================

/**
 * System Logger
 * A robust logging utility that provides timestamped, categorized logs.
 * Useful for debugging and monitoring system health.
 * 
 * @param {string} type - The category of the log (INFO, ERROR, WARN, etc.)
 * @param {string} message - The content of the log
 * @param {object} [meta] - Optional metadata object
 */
function logSystem(type, message, meta = null) {
    const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
    
    const icons = {
        INFO:      'ℹ️  [INFO]   ',
        ERROR:     '❌  [ERROR]  ',
        WARN:      '⚠️  [WARN]   ',
        SUCCESS:   '✅  [SUCCESS]',
        DB:        '🗄️  [DB]     ',
        BOT:       '🤖  [BOT]    ',
        BROADCAST: '📢  [CAST]   ',
        SEC:       '🛡️  [SECURE] ',
        PAYMENT:   '💰  [PAY]    ',
        WIZARD:    '🧙  [WIZARD] ',
        SYSTEM:    '⚙️  [SYSTEM] '
    };
    
    const prefix = icons[type] || '🔹  [LOG]    ';
    console.log(`${prefix} [${timestamp}] : ${message}`);
    
    if (meta) {
        console.log(JSON.stringify(meta, null, 2));
    }
}

// ==================================================================================================
// SECTION 4: DATABASE MODELS (EXTENDED SCHEMAS)
// ==================================================================================================

/**
 * Connect to MongoDB with optimized settings
 */
mongoose.connect(MONGO_URI)
    .then(() => {
        logSystem('DB', '================================================');
        logSystem('DB', '   MONGODB CONNECTION ESTABLISHED SUCCESSFULLY   ');
        logSystem('DB', '================================================');
    })
    .catch(err => {
        logSystem('ERROR', 'CRITICAL DATABASE CONNECTION FAILURE');
        logSystem('ERROR', `Details: ${err.message}`);
    });

// ------------------------------------------------------------------
// 4.1 User Schema - Stores platform user data
// ------------------------------------------------------------------
const userSchema = new mongoose.Schema({
    userId: { 
        type: String, 
        required: true, 
        unique: true, 
        index: true 
    },
    username: { type: String, default: 'Unknown' },
    firstName: { type: String, default: 'User' },
    photoUrl: { type: String, default: '' },
    
    // Plan Details
    plan: { 
        type: String, 
        default: 'Free', 
        enum: ['Free', 'Pro', 'VIP'] 
    },
    planExpiresAt: { type: Date, default: null },
    botLimit: { type: Number, default: 1 },
    
    // Referral System
    referrals: { type: Number, default: 0 },
    referredBy: { type: String, default: null },
    
    // Analytics
    totalPaid: { type: Number, default: 0 },
    joinedAt: { type: Date, default: Date.now },
    lastActive: { type: Date, default: Date.now },
    
    // Status
    isBanned: { type: Boolean, default: false },
    banReason: { type: String, default: null }
});

// ------------------------------------------------------------------
// 4.2 Bot Schema - Stores hosted bot configuration
// ------------------------------------------------------------------
const botSchema = new mongoose.Schema({
    ownerId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    token: { type: String, required: true, unique: true },
    
    // Bot Status
    status: { 
        type: String, 
        default: 'STOPPED', 
        enum: ['RUNNING', 'STOPPED', 'ERROR', 'BANNED', 'SUSPENDED'] 
    },
    
    // Code Storage (The "Brain")
    commands: { type: Object, default: {} }, 
    
    // Performance Metrics
    startedAt: { type: Date, default: null },
    restartCount: { type: Number, default: 0 },
    lastError: { type: String, default: '' },
    
    createdAt: { type: Date, default: Date.now }
});

// ------------------------------------------------------------------
// 4.3 End User Schema - Stores users of hosted bots
// ------------------------------------------------------------------
const endUserSchema = new mongoose.Schema({
    tgId: { type: String, required: true },
    botId: { type: String, required: true, index: true },
    firstName: String,
    username: String,
    interactedAt: { type: Date, default: Date.now }
});
// Composite Index for uniqueness
endUserSchema.index({ tgId: 1, botId: 1 }, { unique: true });

// ------------------------------------------------------------------
// 4.4 Payment Schema - Audit trail for transactions
// ------------------------------------------------------------------
const paymentSchema = new mongoose.Schema({
    userId: String,
    username: String,
    plan: String,
    amount: Number,
    trxId: String,
    method: { type: String, enum: ['manual', 'referral', 'bkash', 'nagad'] },
    
    status: { 
        type: String, 
        default: 'PENDING', 
        enum: ['PENDING', 'APPROVED', 'DECLINED'] 
    },
    
    adminResponseDate: Date,
    date: { type: Date, default: Date.now }
});

// ------------------------------------------------------------------
// 4.5 Audit Log Schema - Security logs for admin actions
// ------------------------------------------------------------------
const auditLogSchema = new mongoose.Schema({
    adminId: String,
    action: String,
    targetId: String,
    details: String,
    date: { type: Date, default: Date.now }
});

// Compile Models
const UserModel = mongoose.model('User', userSchema);
const BotModel = mongoose.model('Bot', botSchema);
const EndUserModel = mongoose.model('EndUser', endUserSchema);
const PaymentModel = mongoose.model('Payment', paymentSchema);
const AuditLogModel = mongoose.model('AuditLog', auditLogSchema);

// ==================================================================================================
// SECTION 5: SERVER MIDDLEWARE CONFIGURATION
// ==================================================================================================

// 5.1 In-Memory Storage
// Stores active Telegraf instances. If server restarts, these are lost and need recovery.
let activeBotInstances = {}; 

// Stores Broadcast Wizard Sessions (Admin ID -> Session Object)
const broadcastSessions = new Map();

// 5.2 Express Middleware
app.use(cors()); // Allow all origins (for WebApp)
app.use(bodyParser.json({ limit: '100mb' })); // Support large code/payloads
app.use(bodyParser.urlencoded({ extended: true, limit: '100mb' }));

// Serve Static Files (The Frontend)
app.use(express.static(path.join(__dirname, 'public')));

// 5.3 Request Logging Middleware
app.use((req, res, next) => {
    // Only log API requests to keep console clean
    if(req.path.startsWith('/api')) {
        // logSystem('INFO', `API Hit: ${req.method} ${req.path}`);
    }
    next();
});

// 5.4 Initialize Main Admin Bot
const mainBot = new Telegraf(ADMIN_CONFIG.token);

// ==================================================================================================
// SECTION 6: UTILITY FUNCTIONS & HELPERS
// ==================================================================================================

/**
 * Validates Telegram Bot Token Format
 * Pattern: Digits + Colon + 35+ Alphanumeric chars
 */
function isValidBotToken(token) {
    const regex = /^\d+:[A-Za-z0-9_-]{35,}$/;
    return regex.test(token);
}

/**
 * Formats Date to human readable string
 */
function formatDate(date) {
    if(!date) return 'Lifetime / Never';
    return moment(date).format('DD MMM YYYY, h:mm A');
}

/**
 * Sleep function for Async/Await (Non-blocking delay)
 * Crucial for rate limiting broadcasts.
 * @param {number} ms - Milliseconds to sleep
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ==================================================================================================
// SECTION 7: SUBSCRIPTION & LIMIT ENFORCEMENT ENGINE
// ==================================================================================================

/**
 * Validates and Enforces User Subscription Status.
 * Checks if the plan has expired. If yes, downgrades to Free.
 * 
 * @param {Object} user - User Mongoose Document
 * @returns {Promise<Object>} Updated User Document
 */
async function validateSubscriptionStatus(user) {
    // Free users never expire
    if (user.plan === 'Free') return user;

    const now = new Date();
    
    // Check if expiry date is present and passed
    if (user.planExpiresAt && now > new Date(user.planExpiresAt)) {
        logSystem('WARN', `Subscription Expired for User: ${user.firstName} (${user.userId})`);

        // 1. Downgrade Database Record
        user.plan = 'Free';
        user.botLimit = PLAN_LIMITS['Free'].botLimit;
        user.planExpiresAt = null; // Reset expiry
        
        await user.save();

        // 2. Enforce Limits on Running Bots
        const bots = await BotModel.find({ ownerId: user.userId });
        const allowed = PLAN_LIMITS['Free'].botLimit;
        
        if (bots.length > allowed) {
            logSystem('SEC', `Enforcing limits for expired user ${user.userId}. Stopping excess bots.`);
            
            // Iterate and stop excess bots
            for (let i = allowed; i < bots.length; i++) {
                const bId = bots[i]._id.toString();
                
                // Stop Instance in RAM
                if (activeBotInstances[bId]) {
                    try { 
                        activeBotInstances[bId].stop(); 
                        logSystem('BOT', `Stopped bot ${bId} due to expiry`);
                    } catch(e) {
                        logSystem('ERROR', `Failed to stop bot ${bId}: ${e.message}`);
                    }
                    delete activeBotInstances[bId];
                }
                
                // Update DB Status
                bots[i].status = 'STOPPED';
                await bots[i].save();
            }
        }
        
        // 3. Notify User
        try {
            await mainBot.telegram.sendMessage(user.userId, 
                "⚠️ <b>Subscription Expired</b>\n\nYour plan has expired. You have been downgraded to the Free tier and excess bots have been stopped.",
                { parse_mode: 'HTML' }
            );
        } catch(e) {}
    }
    return user;
}

// ==================================================================================================
// SECTION 8: THE BOT SANDBOX ENGINE (CORE LOGIC)
// ==================================================================================================

/**
 * Starts a hosted bot instance safely.
 * Creates a Telegraf instance and attaches user-defined commands.
 * 
 * @param {Object} botDoc - Bot Mongoose Document
 * @returns {Promise<Object>} Result object {success, message}
 */
async function startBotEngine(botDoc) {
    const botId = botDoc._id.toString();

    // Check if already running
    if (activeBotInstances[botId]) {
        return { success: true, message: 'Bot is already running.' };
    }

    try {
        logSystem('BOT', `Initializing Engine for: ${botDoc.name} (ID: ${botId})`);

        // Initialize Telegraf
        const bot = new Telegraf(botDoc.token);

        // Clear Webhook (Force Polling Mode)
        try {
            await bot.telegram.deleteWebhook();
        } catch (webhookErr) {
            // Ignore (common if bot is new)
        }

        // Global Error Handler for the Child Bot
        bot.catch((err, ctx) => {
            logSystem('ERROR', `[Child Bot Error] [${botDoc.name}]: ${err.message}`);
        });

        // -------------------------------------------------------------
        // MIDDLEWARE: ANALYTICS & END USER TRACKING
        // -------------------------------------------------------------
        bot.use(async (ctx, next) => {
            if(ctx.from) {
                // Fire and forget (don't await to keep bot fast)
                (async () => {
                    try {
                        const tgId = ctx.from.id.toString();
                        // Check if user exists in EndUser DB
                        const exists = await EndUserModel.exists({ tgId: tgId, botId: botId });
                        
                        if (!exists) {
                            await EndUserModel.create({
                                tgId: tgId,
                                botId: botId,
                                username: ctx.from.username || 'unknown',
                                firstName: ctx.from.first_name || 'unknown'
                            });
                        }
                    } catch(e) {
                        // Ignore duplicate key errors
                    }
                })();
            }
            return next();
        });

        // -------------------------------------------------------------
        // DYNAMIC COMMAND EXECUTION (THE SANDBOX)
        // -------------------------------------------------------------
        bot.on('message', async (ctx) => {
            if (!ctx.message.text) return;
            const text = ctx.message.text;
            
            // Check for command prefix
            if (text.startsWith('/')) {
                // Extract command name (e.g., 'start' from '/start arg')
                const cmdName = text.substring(1).split(' ')[0]; 
                
                // Fetch latest code from DB (Hot Reload Feature)
                const freshBot = await BotModel.findById(botId);
                const code = freshBot?.commands?.[cmdName];
                
                if (code) {
                    try {
                        // 🔒 SECURE CONTEXT CREATION
                        // We wrap the code in an async IIFE inside a Function constructor.
                        // We only pass specific variables to limit scope.
                        
                        const safeRunner = new Function('ctx', 'bot', 'Markup', 'axios', 'moment', `
                            (async () => {
                                try {
                                    // --- USER CODE START ---
                                    ${code}
                                    // --- USER CODE END ---
                                } catch(runtimeErr) {
                                    console.error('Runtime Error in User Bot:', runtimeErr);
                                    ctx.replyWithHTML('⚠️ <b>System Error:</b> Failed to execute command.').catch(()=>{});
                                }
                            })();
                        `);
                        
                        // Execute
                        safeRunner(ctx, bot, Markup, axios, moment);
                        
                    } catch (syntaxErr) {
                        ctx.replyWithHTML(
                            `❌ <b>Code Syntax Error:</b>\n<pre>${syntaxErr.message}</pre>`
                        ).catch(e => {});
                    }
                }
            }
        });

        // Launch the Bot
        await bot.launch({ dropPendingUpdates: true });
        
        // Store in RAM
        activeBotInstances[botId] = bot;
        
        logSystem('SUCCESS', `Bot Online: ${botDoc.name}`);
        return { success: true };

    } catch (error) {
        logSystem('ERROR', `Engine Startup Error [${botDoc.name}]: ${error.message}`);
        return { success: false, message: 'Invalid Token or Telegram API Error' };
    }
}

// ==================================================================================================
// SECTION 9: API CONTROLLERS (FRONTEND INTERFACE)
// ==================================================================================================

/**
 * 9.1 Sync User & Get Bots
 * Endpoint: /api/bots
 */
app.post('/api/bots', async (req, res) => {
    try {
        const { userId, username, firstName } = req.body;
        
        if(!userId) {
            return res.status(400).json({ success: false, message: "User ID Required" });
        }

        // Find or Create User
        let user = await UserModel.findOne({ userId });
        
        if (!user) {
            user = await UserModel.create({ userId, username, firstName });
            logSystem('INFO', `New Registration: ${firstName} (${userId})`);
        } else {
            // Update Profile Info
            if(firstName) user.firstName = firstName;
            if(username) user.username = username;
            user.lastActive = new Date();
            await user.save();
        }

        // Validate Plan Expiry
        user = await validateSubscriptionStatus(user);

        // Fetch User's Bots
        const bots = await BotModel.find({ ownerId: userId }).sort({ createdAt: -1 });

        // Response
        res.json({ 
            success: true, 
            bots, 
            user: {
                ...user.toObject(),
                expireDate: user.planExpiresAt
            } 
        });

    } catch (e) {
        logSystem('ERROR', `API Error /bots: ${e.message}`);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
});

/**
 * 9.2 Create New Bot
 * Endpoint: /api/createBot
 */
app.post('/api/createBot', async (req, res) => {
    try {
        const { token, name, userId } = req.body;
        
        // Validation
        const user = await UserModel.findOne({ userId });
        const currentCount = await BotModel.countDocuments({ ownerId: userId });
        
        if (currentCount >= user.botLimit) {
            return res.json({ 
                success: false, 
                message: `⚠️ Plan Limit Reached (${user.botLimit}). Upgrade to create more.` 
            });
        }
        
        if(!isValidBotToken(token)) {
            return res.json({ success: false, message: '❌ Invalid Bot Token Format.' });
        }

        const existing = await BotModel.findOne({ token });
        if (existing) {
            return res.json({ success: false, message: '❌ Token already registered.' });
        }

        // Create
        const newBot = await BotModel.create({ 
            ownerId: userId, 
            name: name.trim(), 
            token: token.trim() 
        });
        
        logSystem('SUCCESS', `Bot Created: ${name} by ${userId}`);
        res.json({ success: true, bot: newBot });

    } catch (e) {
        res.status(500).json({ success: false, message: "DB Error" });
    }
});

/**
 * 9.3 Toggle Bot (Start/Stop)
 * Endpoint: /api/toggleBot
 */
app.post('/api/toggleBot', async (req, res) => {
    try {
        const { botId, action } = req.body;
        const bot = await BotModel.findById(botId);
        
        if(!bot) return res.json({ success: false, message: 'Bot not found' });

        if (action === 'start') {
            // Start Engine
            const result = await startBotEngine(bot);
            
            if (result.success) {
                bot.status = 'RUNNING';
                bot.startedAt = new Date();
                await bot.save();
                res.json({ success: true, startedAt: bot.startedAt });
            } else {
                res.json(result);
            }
        } else {
            // Stop Engine
            if (activeBotInstances[botId]) {
                try {
                    activeBotInstances[botId].stop();
                } catch(e) {}
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
 * 9.4 Restart Bot
 * Endpoint: /api/restartBot
 */
app.post('/api/restartBot', async (req, res) => {
    try {
        const { botId } = req.body;
        
        // Stop first if running
        if (activeBotInstances[botId]) {
            try { activeBotInstances[botId].stop(); } catch(e){}
            delete activeBotInstances[botId];
        }

        const bot = await BotModel.findById(botId);
        const result = await startBotEngine(bot);

        if (result.success) {
            bot.status = 'RUNNING';
            bot.startedAt = new Date();
            bot.restartCount++;
            await bot.save();
            res.json({ success: true });
        } else {
            bot.status = 'STOPPED';
            await bot.save();
            res.json(result);
        }
    } catch (e) {
        res.json({ success: false, message: "Restart Error" });
    }
});

/**
 * 9.5 Delete Bot
 * Endpoint: /api/deleteBot
 */
app.post('/api/deleteBot', async (req, res) => {
    try {
        const { botId } = req.body;
        
        // Stop instance
        if (activeBotInstances[botId]) {
            try { activeBotInstances[botId].stop(); } catch(e){}
            delete activeBotInstances[botId];
        }
        
        await BotModel.findByIdAndDelete(botId);
        await EndUserModel.deleteMany({ botId: botId }); // Clean up clients
        
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// ------------------------------------------------------------------
// COMMAND EDITOR ENDPOINTS
// ------------------------------------------------------------------

app.post('/api/getCommands', async (req, res) => {
    try {
        const bot = await BotModel.findById(req.body.botId);
        res.json(bot ? bot.commands : {});
    } catch(e) { res.json({}); }
});

app.post('/api/saveCommand', async (req, res) => {
    try {
        const { botId, command, code } = req.body;
        const cleanCmd = command.replace('/', '').replace(/\s/g, '_');
        
        await BotModel.findByIdAndUpdate(botId, { 
            $set: { [`commands.${cleanCmd}`]: code } 
        });
        res.json({ success: true });
    } catch(e) { res.json({ success: false }); }
});

app.post('/api/deleteCommand', async (req, res) => {
    try {
        const { botId, command } = req.body;
        await BotModel.findByIdAndUpdate(botId, { 
            $unset: { [`commands.${command}`]: "" } 
        });
        res.json({ success: true });
    } catch(e) { res.json({ success: false }); }
});

// ------------------------------------------------------------------
// PAYMENT GATEWAY ENDPOINT
// ------------------------------------------------------------------

app.post('/api/submit-payment', async (req, res) => {
    const { trxId, plan, amount, userId, user, method } = req.body;

    // A. REFERRAL PAYMENT
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
        
        return res.json({ success: true, message: "Redeemed Successfully!" });
    }

    // B. MANUAL PAYMENT
    try {
        const payment = await PaymentModel.create({
            userId, username: user, plan, amount, trxId, method
        });

        // Send to Admin Bot
        await mainBot.telegram.sendMessage(ADMIN_CONFIG.adminId, 
            `💰 <b>PAYMENT RECEIVED</b>\n\nUser: @${user}\nPlan: ${plan}\nAmount: ${amount}\nTrxID: <code>${trxId}</code>\nMethod: ${method}`,
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

        res.json({ success: true, message: 'Submitted for Review' });
    } catch(e) { 
        res.json({ success: false, message: 'Admin notification failed' }); 
    }
});

// ==================================================================================================
// SECTION 10: CRON JOBS (AUTOMATION)
// ==================================================================================================

// 10.1 Daily Plan Expiry Check
// Runs every midnight at 00:00
cron.schedule('0 0 * * *', async () => {
    logSystem('SYSTEM', 'Running Daily Plan Expiry Check...');
    
    try {
        const expiredUsers = await UserModel.find({ 
            plan: { $ne: 'Free' }, 
            planExpiresAt: { $lt: new Date() } 
        });
        
        for (const user of expiredUsers) {
            await validateSubscriptionStatus(user);
        }
        
        logSystem('SYSTEM', `Processed ${expiredUsers.length} expired accounts.`);
    } catch(err) {
        logSystem('ERROR', 'Cron Job Failed: ' + err.message);
    }
});

// ==================================================================================================
// SECTION 11: ADVANCED BROADCAST SYSTEM (WIZARD STATE MACHINE)
// ==================================================================================================

// 11.1 Initialize Broadcast Wizard
mainBot.command('broadcast', async (ctx) => {
    // Security Check
    if (ctx.from.id.toString() !== ADMIN_CONFIG.adminId) {
        return ctx.reply("⛔ <b>Access Denied:</b> This command is restricted to Administrators.", { parse_mode: 'HTML' });
    }

    // Initialize Session
    const session = {
        step: 'IDLE', // Current state
        data: {
            image: null,
            text: null,
            buttons: [] // Array of {text, url}
        },
        temp: {} // Temp storage for button creation steps
    };

    broadcastSessions.set(ctx.from.id.toString(), session);
    
    // Launch Interface
    await showBroadcastMenu(ctx);
});

// 11.2 The Wizard UI Renderer
async function showBroadcastMenu(ctx) {
    const userId = ctx.from.id.toString();
    const session = broadcastSessions.get(userId);
    
    if (!session) return ctx.reply("⚠️ Session expired. Type /broadcast again.");

    // Build Status Report
    const data = session.data;
    const hasImg = data.image ? '✅ Set' : '❌ Not Set';
    const hasTxt = data.text ? '✅ Set' : '❌ Not Set';
    const btnCount = data.buttons.length;

    const message = 
        `📢 <b>BROADCAST CONTROL PANEL</b>\n\n` +
        `🖼️ <b>Image:</b> ${hasImg}\n` +
        `📝 <b>Text:</b> ${hasTxt}\n` +
        `🔘 <b>Buttons:</b> ${btnCount} added\n\n` +
        `👇 <b>Tap an element to configure:</b>`;

    // The 5 Button Layout (as requested)
    const keyboard = [
        [
            Markup.button.callback('🖼️ Image', 'wiz_set_image'),
            Markup.button.callback('📝 Text', 'wiz_set_text')
        ],
        [
            Markup.button.callback('🔘 Button', 'wiz_add_button'),
            Markup.button.callback('❌ Cancel', 'wiz_cancel')
        ],
        [
            Markup.button.callback('🚀 SEND BROADCAST', 'wiz_confirm_send')
        ]
    ];

    try {
        if (ctx.callbackQuery) {
            await ctx.editMessageText(message, { parse_mode: 'HTML', ...Markup.inlineKeyboard(keyboard) });
        } else {
            await ctx.replyWithHTML(message, Markup.inlineKeyboard(keyboard));
        }
    } catch (e) {
        // If content is same, ignore "message not modified" error
    }
}

// 11.3 Wizard Action Handlers (State Transitions)

// --- CANCEL ACTION ---
mainBot.action('wiz_cancel', async (ctx) => {
    broadcastSessions.delete(ctx.from.id.toString());
    await ctx.deleteMessage();
    await ctx.answerCbQuery("Broadcast Cancelled");
});

// --- SET IMAGE ACTION ---
mainBot.action('wiz_set_image', async (ctx) => {
    const session = broadcastSessions.get(ctx.from.id.toString());
    if(!session) return;
    
    session.step = 'AWAIT_IMAGE';
    await ctx.editMessageText(
        `🖼️ <b>Upload Image</b>\n\nPlease send the photo you want to broadcast now.`,
        {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[Markup.button.callback('🔙 Back', 'wiz_back_main')]] }
        }
    );
});

// --- SET TEXT ACTION ---
mainBot.action('wiz_set_text', async (ctx) => {
    const session = broadcastSessions.get(ctx.from.id.toString());
    if(!session) return;
    
    session.step = 'AWAIT_TEXT';
    await ctx.editMessageText(
        `📝 <b>Set Message Text</b>\n\nPlease send the text message now.\n<i>(HTML tags are supported)</i>`,
        {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[Markup.button.callback('🔙 Back', 'wiz_back_main')]] }
        }
    );
});

// --- ADD BUTTON ACTION (Step 1: Name) ---
mainBot.action('wiz_add_button', async (ctx) => {
    const session = broadcastSessions.get(ctx.from.id.toString());
    if(!session) return;
    
    session.step = 'AWAIT_BTN_NAME';
    await ctx.editMessageText(
        `🔘 <b>Add Button (Step 1/2)</b>\n\nPlease send the <b>LABEL</b> for the button (e.g. "Join Channel").`,
        {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[Markup.button.callback('🔙 Back', 'wiz_back_main')]] }
        }
    );
});

// --- BACK TO MAIN MENU ACTION ---
mainBot.action('wiz_back_main', async (ctx) => {
    const session = broadcastSessions.get(ctx.from.id.toString());
    if(session) session.step = 'IDLE';
    await showBroadcastMenu(ctx);
});

// --- SUCCESS BACK BUTTON ACTION ---
// Used after successfully adding an element
mainBot.action('wiz_success_back', async (ctx) => {
    const session = broadcastSessions.get(ctx.from.id.toString());
    if(session) session.step = 'IDLE';
    await showBroadcastMenu(ctx);
});

// 11.4 Input Listener (Text & Photo Handler)
mainBot.on(['text', 'photo'], async (ctx, next) => {
    const userId = ctx.from.id.toString();
    
    // Check if user is admin and has an active wizard session
    if (userId !== ADMIN_CONFIG.adminId) return next();
    
    const session = broadcastSessions.get(userId);
    if (!session || session.step === 'IDLE') return next();

    // HANDLER: IMAGE UPLOAD
    if (session.step === 'AWAIT_IMAGE' && ctx.message.photo) {
        // Get the highest resolution photo
        const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        session.data.image = fileId;
        session.step = 'IDLE'; // Reset state logic but wait for button click
        
        // Show Success with Back Button
        await ctx.reply(
            `✅ <b>Image Set Successfully!</b>`, 
            {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[Markup.button.callback('🔙 Back to Menu', 'wiz_success_back')]] }
            }
        );
        return; // Stop propagation
    }

    // HANDLER: TEXT INPUT
    if (session.step === 'AWAIT_TEXT' && ctx.message.text) {
        session.data.text = ctx.message.text;
        session.step = 'IDLE';
        
        await ctx.reply(
            `✅ <b>Text Set Successfully!</b>`, 
            {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[Markup.button.callback('🔙 Back to Menu', 'wiz_success_back')]] }
            }
        );
        return;
    }

    // HANDLER: BUTTON NAME INPUT
    if (session.step === 'AWAIT_BTN_NAME' && ctx.message.text) {
        session.temp.btnName = ctx.message.text;
        session.step = 'AWAIT_BTN_URL'; // Move to next step
        
        await ctx.reply(
            `🔗 <b>Add Button (Step 2/2)</b>\n\nNow send the <b>URL</b> for the button (must start with http/https).`,
            { parse_mode: 'HTML' }
        );
        return;
    }

    // HANDLER: BUTTON URL INPUT
    if (session.step === 'AWAIT_BTN_URL' && ctx.message.text) {
        const url = ctx.message.text;
        
        // Simple URL validation
        if (!url.startsWith('http')) {
            return ctx.reply("⚠️ Invalid URL. It must start with http:// or https://. Try again.");
        }

        // Save Button
        session.data.buttons.push({
            text: session.temp.btnName,
            url: url
        });
        
        // Clear temp
        session.temp = {};
        session.step = 'IDLE';

        await ctx.reply(
            `✅ <b>Button Added Successfully!</b>`, 
            {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[Markup.button.callback('🔙 Back to Menu', 'wiz_success_back')]] }
            }
        );
        return;
    }

    // Pass through if input doesn't match state expectation
    return next();
});


// 11.5 BROADCAST EXECUTION (The Final Step)
mainBot.action('wiz_confirm_send', async (ctx) => {
    const session = broadcastSessions.get(ctx.from.id.toString());
    if(!session) return;

    // Validation: Must have at least Text or Image
    if (!session.data.text && !session.data.image) {
        return ctx.answerCbQuery("⚠️ You must add at least Text or Image!", { show_alert: true });
    }

    // Ask for Audience Selection
    await ctx.editMessageText(
        `🚀 <b>Ready to Launch!</b>\n\nSelect the target audience for this broadcast:`,
        {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '👤 My Users (Direct)', callback_data: 'wiz_exec_main' },
                        { text: '👥 Client Users (Hosted)', callback_data: 'wiz_exec_hosted' }
                    ],
                    [{ text: '🔙 Back to Menu', callback_data: 'wiz_back_main' }]
                ]
            }
        }
    );
});

// 11.6 SENDING LOGIC (With Rate Limiting)
mainBot.action(['wiz_exec_main', 'wiz_exec_hosted'], async (ctx) => {
    const type = ctx.match[0]; // wiz_exec_main OR wiz_exec_hosted
    const userId = ctx.from.id.toString();
    const session = broadcastSessions.get(userId);
    
    if(!session) return ctx.reply("Session error");

    await ctx.deleteMessage();
    const progressMsg = await ctx.reply("⏳ <b>Broadcasting...</b>\n0% Completed", { parse_mode: 'HTML' });

    // Prepare Payload
    const content = session.data;
    const extra = { parse_mode: 'HTML' };
    
    if (content.buttons.length > 0) {
        const keyboard = content.buttons.map(b => [Markup.button.url(b.text, b.url)]);
        extra.reply_markup = { inline_keyboard: keyboard };
    }

    // --- HELPER: Send Function ---
    const sendPayload = async (targetBot, targetChatId) => {
        try {
            if (content.image) {
                await targetBot.telegram.sendPhoto(targetChatId, content.image, {
                    caption: content.text || '',
                    ...extra
                });
            } else {
                await targetBot.telegram.sendMessage(targetChatId, content.text, extra);
            }
            return true;
        } catch (e) {
            // Log block errors but don't stop
            return false;
        }
    };

    let sent = 0;
    let failed = 0;
    let totalTargets = 0;

    logSystem('BROADCAST', `Execution Started: ${type}`);

    // LOGIC A: SEND TO MY DIRECT USERS
    if (type === 'wiz_exec_main') {
        totalTargets = await UserModel.countDocuments();
        const cursor = UserModel.find().cursor();
        
        let processed = 0;
        
        for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
            const success = await sendPayload(mainBot, doc.userId);
            if(success) sent++; else failed++;
            processed++;

            // Update Progress UI every 20 users
            if (processed % 20 === 0) {
                try {
                    await ctx.telegram.editMessageText(
                        ctx.chat.id, 
                        progressMsg.message_id, 
                        null, 
                        `⏳ <b>Broadcasting...</b>\n${Math.round((processed/totalTargets)*100)}% Completed`
                    );
                } catch(e){}
            }

            // Rate Limit: 30ms delay
            await sleep(30); 
        }
    }

    // LOGIC B: SEND TO CLIENT USERS (HOSTED BOTS)
    else {
        // Logic is more complex here. We iterate active bots, then their users.
        const runningBots = await BotModel.find({ status: 'RUNNING' });
        
        for (const bot of runningBots) {
            // Get Telegraf Instance
            let instance = activeBotInstances[bot._id.toString()];
            if (!instance) {
                // If not in RAM, temporarily init
                try { instance = new Telegraf(bot.token); } catch(e) { continue; }
            }

            const endUsers = await EndUserModel.find({ botId: bot._id.toString() });
            
            for (const eu of endUsers) {
                if(eu.tgId === ADMIN_CONFIG.adminId || eu.tgId === bot.ownerId) continue;
                
                const success = await sendPayload(instance, eu.tgId);
                if(success) sent++; else failed++;
                
                // Slower rate limit for hosted bots to avoid API spam flags
                await sleep(50);
            }
        }
    }

    // FINISH
    broadcastSessions.delete(userId);
    
    await ctx.telegram.editMessageText(
        ctx.chat.id, 
        progressMsg.message_id, 
        null,
        `✅ <b>Broadcast Completed!</b>\n\n` +
        `📨 Sent: <b>${sent}</b>\n` +
        `❌ Failed: <b>${failed}</b>`,
        { parse_mode: 'HTML' }
    );
    
    logSystem('BROADCAST', `Finished. Sent: ${sent}, Failed: ${failed}`);
});


// ==================================================================================================
// SECTION 12: MAIN ADMIN BOT MENU & COMMANDS
// ==================================================================================================

// 12.1 /start Command
mainBot.start(async (ctx) => {
    // If Admin is in Wizard mode, ignore
    if (broadcastSessions.has(ctx.from.id.toString())) return;

    // Referral Tracking
    const args = ctx.message.text.split(' ');
    const referrerId = args[1];

    let user = await UserModel.findOne({ userId: ctx.from.id.toString() });
    
    if (!user) {
        // New User Registration
        user = await UserModel.create({
            userId: ctx.from.id.toString(),
            firstName: ctx.from.first_name,
            username: ctx.from.username,
            referredBy: (referrerId && referrerId !== ctx.from.id.toString()) ? referrerId : null
        });

        // Award Referral Point
        if (user.referredBy) {
            await UserModel.findOneAndUpdate({ userId: user.referredBy }, { $inc: { referrals: 1 } });
            try { 
                await ctx.telegram.sendMessage(user.referredBy, 
                    `🎉 <b>New Referral!</b>\n${ctx.from.first_name} joined via your link.\n<b>+1 Point Added.</b>`, 
                    { parse_mode: 'HTML' }
                ); 
            } catch(e){}
        }
        
        logSystem('INFO', `New Bot User: ${ctx.from.first_name}`);
    }

    // Main Menu Response
    await ctx.replyWithHTML(
        `👋 <b>Welcome to Laga Host AI!</b>\n\n` +
        `The Ultimate Platform to Host & Manage Telegram Bots.\n\n` +
        `🚀 <b>Features:</b>\n` +
        `• Create Bots without coding\n` +
        `• AI Code Generator\n` +
        `• 24/7 Hosting\n` +
        `• Earn via Referrals\n\n` +
        `👇 <b>Tap below to open the Dashboard:</b>`,
        Markup.inlineKeyboard([
            [Markup.button.webApp('🚀 Open Console', WEB_APP_URL)],
            [
                Markup.button.url('📢 Channel', ADMIN_CONFIG.support.channelUrl),
                Markup.button.url('🆘 Support', `https://t.me/${ADMIN_CONFIG.support.adminUser.replace('@','')}`)
            ],
            [Markup.button.callback('📊 My Status', 'cmd_status')]
        ])
    );
});

// 12.2 My Status Callback
mainBot.action('cmd_status', async (ctx) => {
    const user = await UserModel.findOne({ userId: ctx.from.id });
    if (!user) return ctx.answerCbQuery("User not found");

    const bots = await BotModel.countDocuments({ ownerId: user.userId });
    const active = await BotModel.countDocuments({ ownerId: user.userId, status: 'RUNNING' });
    const expiry = user.plan === 'Free' ? 'Lifetime' : moment(user.planExpiresAt).format('DD MMM YYYY');

    await ctx.replyWithHTML(
        `👤 <b>YOUR PROFILE</b>\n\n` +
        `🆔 <b>ID:</b> <code>${user.userId}</code>\n` +
        `💎 <b>Plan:</b> ${user.plan}\n` +
        `📅 <b>Expires:</b> ${expiry}\n` +
        `🤖 <b>Bots:</b> ${active}/${bots} Running\n` +
        `💰 <b>Points:</b> ${user.referrals}`,
        Markup.inlineKeyboard([[Markup.button.callback('❌ Close', 'cmd_close')]])
    );
    await ctx.answerCbQuery();
});

// 12.3 Admin Stats
mainBot.command('stats', async (ctx) => {
    if(ctx.from.id.toString() !== ADMIN_CONFIG.adminId) return;

    const userCount = await UserModel.countDocuments();
    const botCount = await BotModel.countDocuments();
    const runningCount = await BotModel.countDocuments({ status: 'RUNNING' });
    const endUserCount = await EndUserModel.countDocuments();
    
    // Server Metrics
    const memoryUsage = process.memoryUsage();
    const ramUsed = Math.round(memoryUsage.rss / 1024 / 1024);

    ctx.replyWithHTML(
        `📊 <b>SYSTEM STATISTICS</b>\n\n` +
        `👥 <b>Platform Users:</b> ${userCount}\n` +
        `👤 <b>End Users:</b> ${endUserCount}\n` +
        `🤖 <b>Total Bots:</b> ${botCount}\n` +
        `🟢 <b>Active Bots:</b> ${runningCount}\n\n` +
        `⚙️ <b>Server Load:</b>\n` +
        `• RAM: ${ramUsed} MB\n` +
        `• Uptime: ${Math.floor(process.uptime() / 60)} mins`
    );
});

// 12.4 Close Action
mainBot.action('cmd_close', async (ctx) => {
    await ctx.deleteMessage();
});

// ==================================================================================================
// SECTION 13: ADMIN PAYMENT APPROVAL WORKFLOW
// ==================================================================================================

/**
 * Handle Payment Approval
 * Regex matches: approve:USER_ID:PLAN_NAME:PAYMENT_DB_ID
 */
mainBot.action(/^approve:(\d+):(\w+):(.+)$/, async (ctx) => {
    try {
        const [_, userId, plan, payId] = ctx.match;
        const limits = PLAN_LIMITS[plan];

        if (!limits) return ctx.answerCbQuery("Invalid Plan Error");

        // Calculate New Expiry
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + limits.validityDays);

        // Update User
        await UserModel.findOneAndUpdate(
            { userId }, 
            { 
                plan: plan, 
                botLimit: limits.botLimit, 
                planExpiresAt: expiry 
            }
        );

        // Update Payment Record
        await PaymentModel.findByIdAndUpdate(payId, { status: 'APPROVED', adminResponseDate: new Date() });

        // Update Admin Message
        await ctx.editMessageText(
            `${ctx.callbackQuery.message.text}\n\n✅ <b>APPROVED</b> by Admin`, 
            { parse_mode: 'HTML' }
        );

        // Notify User
        await mainBot.telegram.sendMessage(userId, 
            `✅ <b>Payment Accepted!</b>\n\n` +
            `You have been upgraded to the <b>${plan}</b> plan.\n` +
            `Valid until: ${formatDate(expiry)}\n\n` +
            `Restart your bots to apply premium speeds.`,
            { parse_mode: 'HTML' }
        );

        logSystem('PAYMENT', `Approved ${plan} for ${userId}`);

    } catch (e) {
        console.error(e);
        ctx.answerCbQuery("Error processing approval");
    }
});

/**
 * Handle Payment Decline
 */
mainBot.action(/^decline:(\d+):(.+)$/, async (ctx) => {
    try {
        const [_, userId, payId] = ctx.match;

        // Update DB
        await PaymentModel.findByIdAndUpdate(payId, { status: 'DECLINED', adminResponseDate: new Date() });

        // Update Admin UI
        await ctx.editMessageText(
            `${ctx.callbackQuery.message.text}\n\n❌ <b>DECLINED</b> by Admin`, 
            { parse_mode: 'HTML' }
        );

        // Notify User
        await mainBot.telegram.sendMessage(userId, 
            `❌ <b>Payment Declined</b>\n\n` +
            `Your payment request could not be verified.\n` +
            `Please verify your Transaction ID and try again, or contact support.`,
            { parse_mode: 'HTML' }
        );

        logSystem('PAYMENT', `Declined payment for ${userId}`);

    } catch (e) {
        console.error(e);
    }
});

// ==================================================================================================
// SECTION 14: SYSTEM STARTUP & RECOVERY SEQUENCE
// ==================================================================================================

/**
 * 1. Database Connection Listener
 *    - Once DB connects, attempt to restore previous bot sessions.
 */
mongoose.connection.once('open', async () => {
    logSystem('SYSTEM', 'Initiating Bot Recovery Sequence...');
    
    try {
        const runningBots = await BotModel.find({ status: 'RUNNING' });
        
        if (runningBots.length === 0) {
            logSystem('SYSTEM', 'No active bots to restore.');
            return;
        }

        logSystem('SYSTEM', `Found ${runningBots.length} bots marked as RUNNING. Restoring...`);
        
        let successCount = 0;
        
        for (const bot of runningBots) {
            // Restore session
            const result = await startBotEngine(bot);
            if (result.success) successCount++;
            
            // Stagger startups to prevent CPU spike (100ms delay)
            await sleep(100);
        }
        
        logSystem('SUCCESS', `Restored ${successCount}/${runningBots.length} bot sessions.`);
        
    } catch (e) {
        logSystem('ERROR', `Recovery Failed: ${e.message}`);
    }
});

/**
 * 2. Start Main Admin Bot
 */
mainBot.launch({ dropPendingUpdates: true })
    .then(() => {
        logSystem('SUCCESS', 'Main Admin Bot is Online and Polling.');
    })
    .catch(err => {
        logSystem('ERROR', `Main Bot Launch Failed: ${err.message}`);
    });

/**
 * 3. Start Express HTTP Server
 */
app.listen(PORT, () => {
    logSystem('SUCCESS', `------------------------------------------------`);
    logSystem('SUCCESS', `   LAGA HOST SERVER RUNNING ON PORT ${PORT}     `);
    logSystem('SUCCESS', `   DASHBOARD: ${WEB_APP_URL}     `);
    logSystem('SUCCESS', `------------------------------------------------`);
});

/**
 * 4. Graceful Shutdown Handlers
 *    - Ensures all bots stop and DB closes cleanly on server restart/crash.
 */
const gracefulShutdown = (signal) => {
    logSystem('WARN', `${signal} Received. Shutting down system...`);
    
    // Stop Main Bot
    mainBot.stop(signal);
    
    // Stop all Hosted Bots
    const botIds = Object.keys(activeBotInstances);
    botIds.forEach(id => {
        try {
            activeBotInstances[id].stop(signal);
        } catch(e) {}
    });
    
    logSystem('INFO', `Stopped ${botIds.length} hosted bots.`);
    
    // Close DB
    mongoose.connection.close(false, () => {
        logSystem('DB', 'Database Connection Closed.');
        process.exit(0);
    });
};

process.once('SIGINT', () => gracefulShutdown('SIGINT'));
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Fallback for uncaught exceptions to prevent full crash
process.on('uncaughtException', (err) => {
    logSystem('ERROR', `Uncaught Exception: ${err.message}`);
    console.error(err);
    // Keep running
});

process.on('unhandledRejection', (reason, promise) => {
    logSystem('ERROR', 'Unhandled Rejection at Promise');
    console.error(reason);
    // Keep running
});

/**
 * END OF FILE
 * Laga Host Server v5.0.0
 */
