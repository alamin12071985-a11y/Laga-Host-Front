/**
 * =================================================================================
 * PROJECT: LAGA HOST ULTIMATE SERVER (SECURE ENTERPRISE EDITION)
 * VERSION: 7.2.0 (AI Magic Support & Expiry Logic Enforced)
 * AUTHOR: Laga Host Team
 * COPYRIGHT: © 2024-2026 Laga Host Inc.
 * 
 * DESCRIPTION: 
 * The comprehensive backend server for the Laga Host Telegram Bot Platform.
 * This server acts as the central nervous system handling:
 * 
 *  [CORE FEATURES]
 *  - Multi-tenant Bot Hosting (Sandboxed VM Environments)
 *  - Secure Payment Gateway & Subscription Lifecycle Management
 *  - Real-time Expiry Enforcement & Auto-Downgrade System
 *  - DUAL CHANNEL Broadcast System (Main Users vs Client End-Users)
 * 
 *  [AI & LOGIC]
 *  - Frontend AI Architecture Support (WebSocket Integration)
 *  - Dynamic Command Execution Engine with Context Isolation
 *  - Real-time Analytics & User Activity Tracking
 * 
 * NOTE: This file is optimized for high-availability environments (Render/Heroku/VPS).
 * =================================================================================
 */

// =================================================================================
// 1. SYSTEM DEPENDENCIES & LIBRARY IMPORTS
// =================================================================================

// Load environment variables from .env file for security credentials
require('dotenv').config();

// Express Framework for handling HTTP/API Requests
const express = require('express');

// Telegraf Framework for Telegram Bot Interaction (v4.x)
const { Telegraf, Markup, session } = require('telegraf');

// Middleware for parsing request bodies (JSON/URL-encoded)
const bodyParser = require('body-parser');

// CORS Middleware to allow cross-origin requests from the Frontend WebApp
const cors = require('cors');

// Node.js Built-in Utilities for File System and Path handling
const path = require('path');
const fs = require('fs');

// Database Driver (MongoDB Mongoose) - Object Data Modeling (ODM)
const mongoose = require('mongoose');

// Task Scheduler for automated maintenance jobs (CRON)
const cron = require('node-cron');

// Date & Time Formatting Library for human-readable timestamps
const moment = require('moment');

// HTTP Client for external API calls (used inside sandbox if enabled)
const axios = require('axios');

// =================================================================================
// 2. GLOBAL CONFIGURATION & CONSTANTS
// =================================================================================

// Initialize the Express Application
const app = express();

// Define Server Port (Defaults to 3000 if not specified in ENV)
const PORT = process.env.PORT || 3000;

// ⚠️ SYSTEM URL CONFIGURATION (Critical for WebApp Buttons)
const WEB_APP_URL = process.env.WEB_APP_URL || "https://lagahost.onrender.com";

// 🛠️ ADMIN & PLATFORM SETTINGS
// Centralized configuration for administrative control
const ADMIN_CONFIG = {
    // The Main Host Bot Token (The bot users interact with directly)
    token: process.env.BOT_TOKEN || "8264143788:AAH0fRkMqBw4rONo0WVEi-OyAVkPs9bRt84",
    
    // The Super Admin's Telegram ID (Required for Alerts, Payments & Debugging)
    adminId: process.env.ADMIN_ID || "7605281774",
    
    // Mandatory Channels to Join (For Force Subscribe features - Future use)
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

    // Support Resources Links
    support: {
        adminUser: "@lagatech",
        channelUrl: "https://t.me/lagatech",
        youtubeUrl: "https://youtube.com/@lagatech?si=LC_FiXS4BdwR11XR",
        tutorialVideoUrl: "https://youtube.com/@lagatech"
    },

    // Payment Methods Display Info (Displayed in Manual Payment Modal)
    payment: {
        nagad: "01761494948",
        bkash: "01761494948"
    }
};

// 📊 PLAN LIMITS & PRICING CONFIGURATION
// logic for upgrading and downgrading users based on payments
const PLAN_LIMITS = {
    'Free': { 
        botLimit: 1, 
        validityDays: 9999, // Effectively Lifetime
        pricePoints: 0,
        cpuPriority: 'Low'
    },
    'Pro':  { 
        botLimit: 5, 
        validityDays: 30, 
        pricePoints: 50,
        cpuPriority: 'Medium'
    },
    'VIP':  { 
        botLimit: 10, 
        validityDays: 30, 
        pricePoints: 80,
        cpuPriority: 'High'
    }
};

// 🗄️ DATABASE CONNECTION STRING
// Secure connection string to MongoDB Atlas Cluster
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://lagahost:l%40g%40ho%24t@snowmanadventure.ocodku0.mongodb.net/snowmanadventure?retryWrites=true&w=majority&appName=snowmanadventure";

// =================================================================================
// 3. ENHANCED LOGGING SYSTEM
// =================================================================================

/**
 * Logs system events to the console with timestamp and category icons.
 * This helps in debugging issues in production environments like Render logs.
 * 
 * @param {string} type - The category (INFO, ERROR, WARN, SUCCESS, DB, BOT, BROADCAST)
 * @param {string} message - The message to be logged
 */
function logSystem(type, message) {
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
        PAYMENT:   '💰  [PAY]    '
    };
    
    const prefix = icons[type] || '🔹  [LOG]    ';
    console.log(`${prefix} [${timestamp}] : ${message}`);
}

// =================================================================================
// 4. DATABASE MODELS & SCHEMAS (ROBUST & DETAILED)
// =================================================================================

// Establish Database Connection with specific options for stability
mongoose.connect(MONGO_URI)
    .then(() => {
        logSystem('DB', '----------------------------------------');
        logSystem('DB', 'MongoDB Database Connected Successfully');
        logSystem('DB', 'Cluster: SnowmanAdventure');
        logSystem('DB', 'Connection State: ESTABLISHED');
        logSystem('DB', '----------------------------------------');
    })
    .catch(err => {
        logSystem('ERROR', 'CRITICAL DATABASE CONNECTION FAILURE');
        logSystem('ERROR', `Details: ${err.message}`);
        // We do not exit process here to allow retry logic/server recovery
    });

// --- 4.1 USER SCHEMA (Main Platform Users) ---
// Stores information about the people using Laga Host to create bots
const userSchema = new mongoose.Schema({
    // Unique Telegram ID of the user
    userId: { 
        type: String, 
        required: true, 
        unique: true, 
        index: true 
    },
    // User Profile Info
    username: { type: String, default: 'Unknown' },
    firstName: { type: String, default: 'User' },
    photoUrl: { type: String, default: '' },
    
    // Subscription Plan Configuration
    plan: { 
        type: String, 
        default: 'Free', 
        enum: ['Free', 'Pro', 'VIP'] 
    },
    // The exact date/time when the plan expires. If null, it assumes Free/Lifetime.
    planExpiresAt: { type: Date, default: null },
    
    // Resource Limits (Enforced by Logic)
    botLimit: { type: Number, default: 1 },
    
    // Referral System (Points)
    referrals: { type: Number, default: 0 },
    referredBy: { type: String, default: null },
    
    // Financial History
    totalPaid: { type: Number, default: 0 },
    
    // Account Status & Metadata
    isBanned: { type: Boolean, default: false },
    joinedAt: { type: Date, default: Date.now },
    lastActive: { type: Date, default: Date.now }
});

// --- 4.2 BOT SCHEMA (Hosted Bots) ---
// Stores configuration for the hosted bots created by users
const botSchema = new mongoose.Schema({
    ownerId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    token: { type: String, required: true, unique: true },
    
    // Bot Execution Status
    status: { 
        type: String, 
        default: 'STOPPED', 
        enum: ['RUNNING', 'STOPPED', 'ERROR', 'BANNED', 'SUSPENDED'] 
    },
    
    // Code Storage (The "Brain")
    // commands object maps command names (e.g., 'start') to JS code strings
    // This allows dynamic execution via the sandbox engine
    commands: { type: Object, default: {} }, 
    
    // Environment Variables (Future Proofing for API Keys)
    envVars: { type: Object, default: {} },
    
    // Uptime & Performance Statistics
    startedAt: { type: Date, default: null },
    restartCount: { type: Number, default: 0 },
    lastError: { type: String, default: '' },
    
    // Setup Flags
    isFirstLive: { type: Boolean, default: true },
    
    createdAt: { type: Date, default: Date.now }
});

// --- 4.3 END USER SCHEMA (Client Users) ---
// Stores users who interact with the HOSTED bots.
// Essential for "Client User" Broadcasting.
const endUserSchema = new mongoose.Schema({
    tgId: { type: String, required: true },
    botId: { type: String, required: true, index: true },
    username: String,
    firstName: String,
    interactedAt: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now }
});
// Compound index: A user is unique per bot instance
endUserSchema.index({ tgId: 1, botId: 1 }, { unique: true });

// --- 4.4 PAYMENT SCHEMA ---
// Keeps a comprehensive record of all transactions for audit
const paymentSchema = new mongoose.Schema({
    userId: String,
    username: String,
    plan: String,
    amount: Number,
    trxId: String,
    method: String, // 'bkash', 'nagad', 'referral', 'manual'
    status: { 
        type: String, 
        default: 'PENDING', 
        enum: ['PENDING', 'APPROVED', 'DECLINED'] 
    },
    adminResponseDate: Date,
    date: { type: Date, default: Date.now }
});

// Compile Models
const UserModel = mongoose.model('User', userSchema);
const BotModel = mongoose.model('Bot', botSchema);
const EndUserModel = mongoose.model('EndUser', endUserSchema);
const PaymentModel = mongoose.model('Payment', paymentSchema);

// =================================================================================
// 5. SERVER MIDDLEWARE & SECURITY SETUP
// =================================================================================

// 5.1 RAM Storage for Active Bot Instances & Broadcast Data
// Since JS objects are stored in RAM, if the server restarts, this clears.
// We have a recovery mechanism in the startup sequence.
let activeBotInstances = {}; 

// Temporary storage for Broadcast messages (Admin ID -> Message)
let pendingBroadcasts = {};

// 5.2 Middleware Configuration
// Enable Cross-Origin Resource Sharing for the WebApp
app.use(cors()); 

// Allow large payloads for code saving (50mb limit is generous for text code)
app.use(bodyParser.json({ limit: '50mb' })); 
app.use(bodyParser.urlencoded({ extended: true }));

// Serve Static Assets from 'public' folder (Frontend SPA)
app.use(express.static(path.join(__dirname, 'public'))); 

// 5.3 Request Logging Middleware (Custom)
app.use((req, res, next) => {
    // Filter logs to avoid spamming console with static file requests
    // Only log API requests to keep the console clean but useful
    if(req.path.startsWith('/api')) {
        // logSystem('INFO', `API Request: ${req.method} ${req.path} from ${req.ip}`);
    }
    next();
});

// 5.4 Initialize Main Admin Bot
const mainBot = new Telegraf(ADMIN_CONFIG.token);

// =================================================================================
// 6. HELPER FUNCTIONS & LOGIC UTILITIES
// =================================================================================

/**
 * Validates a Telegram Bot Token format using Regex
 * Ensures the token follows the pattern: 123456789:ABCdefGHIjklMNOpqrSTUvwxYZ
 * @param {string} token 
 * @returns {boolean}
 */
function isValidBotToken(token) {
    return /^\d+:[A-Za-z0-9_-]{35,}$/.test(token);
}

/**
 * Formats a Date object to a readable string for Telegram Messages
 * @param {Date} date 
 * @returns {string} e.g., "12 Jan 2026, 10:30 AM"
 */
function formatDate(date) {
    if(!date) return 'Lifetime / Never';
    return moment(date).format('DD MMM YYYY, h:mm A');
}

/**
 * Sleep function for rate limiting to avoid Telegram 429 Errors
 * @param {number} ms 
 * @returns {Promise}
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 🔒 SUBSCRIPTION VALIDATOR & ENFORCER
 * Checks if a user's plan has expired.
 * If expired:
 * 1. Downgrades plan to Free
 * 2. Resets limits
 * 3. Stops excess bots
 * 4. Saves user state
 * 
 * @param {Object} user - The Mongoose User Document
 * @returns {Promise<Object>} - The Updated User Document
 */
async function validateSubscriptionStatus(user) {
    if (user.plan === 'Free') return user; // No expiry for Free plan

    const now = new Date();
    // Check if planExpiresAt is set and date is in the past
    if (user.planExpiresAt && now > new Date(user.planExpiresAt)) {
        logSystem('WARN', `Subscription Expired for User: ${user.firstName} (${user.userId})`);

        // 1. Downgrade to Free
        user.plan = 'Free';
        user.botLimit = PLAN_LIMITS['Free'].botLimit;
        user.planExpiresAt = null; // Reset expiry
        
        await user.save();

        // 2. Enforce Limit immediately (Stop extra bots)
        const bots = await BotModel.find({ ownerId: user.userId });
        
        // If they have more bots than the Free limit (1), stop the extras
        const allowed = PLAN_LIMITS['Free'].botLimit;
        if (bots.length > allowed) {
            logSystem('SEC', `Enforcing limits for expired user ${user.userId}. Stopping excess bots.`);
            
            // Iterate starting from the allowed index
            for (let i = allowed; i < bots.length; i++) {
                const bId = bots[i]._id.toString();
                
                // Stop Instance in RAM
                if (activeBotInstances[bId]) {
                    try { activeBotInstances[bId].stop(); } catch(e) {}
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

// =================================================================================
// 7. BOT HOSTING ENGINE (THE SANDBOX CORE)
// =================================================================================

/**
 * The Heart of Laga Host.
 * This function spins up a new Telegraf instance for a hosted bot.
 * It sets up a "Sandbox" environment for executing dynamic code securely.
 * 
 * @param {Object} botDoc - The MongoDB document of the bot
 * @returns {Promise<Object>} Result { success: boolean, message: string }
 */
async function startBotEngine(botDoc) {
    const botId = botDoc._id.toString();

    // 1. Double Check: Is it already running?
    if (activeBotInstances[botId]) {
        return { success: true, message: 'Bot is already running.' };
    }

    try {
        logSystem('BOT', `Initializing Engine for: ${botDoc.name} (ID: ${botId})`);

        // 2. Initialize Telegraf Instance
        const bot = new Telegraf(botDoc.token);

        // 🛑 CRITICAL: Remove Webhook to ensure Polling works
        try {
            await bot.telegram.deleteWebhook();
        } catch (webhookErr) {
            // Ignore webhook errors (common if bot was never set up)
        }

        // 3. Verify Token & Connectivity
        const botInfo = await bot.telegram.getMe();
        
        // 4. Global Error Handler for this specific bot instance
        bot.catch((err, ctx) => {
            logSystem('ERROR', `[Child Bot Error] [${botDoc.name}]: ${err.message}`);
            // Optional: Save error to DB for user to see
        });

        // =========================================================
        // MIDDLEWARE: ANALYTICS TRACKER (End Users)
        // =========================================================
        bot.use(async (ctx, next) => {
            if(ctx.from) {
                // Execute in background (Fire & Forget)
                (async () => {
                    try {
                        const tgId = ctx.from.id.toString();
                        // 🛡️ ANALYTICS FILTER:
                        // Check if user exists in EndUserModel. If not, create.
                        // This table is used for "Client User" broadcasting.
                        const exists = await EndUserModel.exists({ 
                            tgId: tgId, 
                            botId: botId 
                        });
                        
                        if (!exists) {
                            await EndUserModel.create({
                                tgId: tgId,
                                botId: botId,
                                username: ctx.from.username || 'unknown',
                                firstName: ctx.from.first_name || 'unknown'
                            });
                        }
                    } catch(e) {
                        // Ignore duplicate key errors quietly
                    }
                })();
            }
            return next();
        });

        // =========================================================
        // MAIN LOGIC: DYNAMIC CODE EXECUTION (SANDBOX)
        // =========================================================
        bot.on('message', async (ctx) => {
            if (!ctx.message.text) return;
            const text = ctx.message.text;
            
            if (text.startsWith('/')) {
                // Extract command name (e.g., 'start' from '/start')
                const cmdName = text.substring(1).split(' ')[0]; 
                
                // Fetch fresh code from DB (Allows Hot-Reloading without restart)
                // This means users can edit code in WebApp and it applies instantly!
                const freshBot = await BotModel.findById(botId);
                const code = freshBot?.commands?.[cmdName];
                
                if (code) {
                    try {
                        // 🔒 CREATING THE SANDBOX
                        // We create a new Function that wraps the user's code.
                        // We strictly pass only necessary variables to prevent system access.
                        
                        // Note to Editor: The 'ctx.replyWithHTML' and 'Markup' are passed here 
                        // so the AI generated code works perfectly.
                        const runUserCode = new Function('ctx', 'bot', 'Markup', 'axios', 'moment', `
                            try {
                                // --- BEGIN USER CODE ---
                                ${code}
                                // --- END USER CODE ---
                            } catch(runtimeError) {
                                // User-Level Runtime Error Handling
                                ctx.replyWithHTML(
                                    '⚠️ <b>Bot Logic Error:</b>\\n' + 
                                    '<pre>' + runtimeError.message + '</pre>'
                                ).catch(e => {});
                            }
                        `);
                        
                        // Execute the code
                        runUserCode(ctx, bot, Markup, axios, moment);
                        
                    } catch (syntaxError) {
                        // System-Level Syntax Error Handling (e.g., missing brackets)
                        ctx.replyWithHTML(
                            `❌ <b>Syntax Error in Command:</b>\n<pre>${syntaxError.message}</pre>`
                        ).catch(e => {});
                    }
                }
            }
        });

        // 5. Launch The Instance
        // dropPendingUpdates: true ensures bot doesn't spam old messages on restart
        bot.launch({ dropPendingUpdates: true })
            .then(() => {
                logSystem('SUCCESS', `Bot Started: ${botDoc.name} (@${botInfo.username})`);
            })
            .catch(err => {
                logSystem('ERROR', `Bot Launch Failed [${botDoc.name}]: ${err.message}`);
                delete activeBotInstances[botId]; // Clean up RAM
            });

        // 6. Store Instance in RAM
        activeBotInstances[botId] = bot;
        
        // 7. Update DB Status
        if (botDoc.isFirstLive) {
            botDoc.isFirstLive = false;
            await botDoc.save();
        }

        return { success: true, botInfo };

    } catch (error) {
        logSystem('ERROR', `Engine Startup Error [${botDoc.name}]: ${error.message}`);
        return { success: false, message: 'Invalid Token or Server Error' };
    }
}

// =================================================================================
// 8. API ROUTE HANDLERS (BACKEND INTERFACE)
// =================================================================================

/**
 * 8.1 GET BOTS (SYNC USER)
 * This is the main endpoint hit by the WebApp when it loads.
 * It syncs user data, checks expiration, and returns the list of bots.
 */
app.post('/api/bots', async (req, res) => {
    try {
        const { userId, username, firstName } = req.body;
        
        if(!userId) {
            return res.status(400).json({ error: "Invalid Request: User ID Missing" });
        }

        // 1. Find or Create User
        let user = await UserModel.findOne({ userId });
        
        if (!user) {
            user = await UserModel.create({ userId, username, firstName });
            logSystem('INFO', `New Platform User Registered: ${firstName} (${userId})`);
        } else {
            // Update Activity & Names
            let changed = false;
            if(firstName && user.firstName !== firstName) { user.firstName = firstName; changed = true; }
            if(username && user.username !== username) { user.username = username; changed = true; }
            user.lastActive = new Date();
            if(changed) await user.save();
        }

        // 2. CHECK EXPIRY LOGIC (Crucial Step)
        // Before returning data, we ensure the user is on the correct plan
        user = await validateSubscriptionStatus(user);

        // 3. Fetch Bots
        const bots = await BotModel.find({ ownerId: userId }).sort({ createdAt: -1 });
        
        // 4. Return Data (Mapped for Frontend)
        res.json({ 
            success: true, 
            bots, 
            user: {
                ...user.toObject(),
                expireDate: user.planExpiresAt // Mapping for Frontend compatibility
            } 
        });

    } catch (e) {
        logSystem('ERROR', `/api/bots: ${e.message}`);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

/**
 * 8.2 CREATE BOT (WITH VALIDATION & LIMIT CHECK)
 */
app.post('/api/createBot', async (req, res) => {
    try {
        const { token, name, userId } = req.body;
        
        // Step 1: Check Limits
        const user = await UserModel.findOne({ userId });
        const currentCount = await BotModel.countDocuments({ ownerId: userId });
        
        if (currentCount >= user.botLimit) {
            return res.json({ 
                success: false, 
                message: `⚠️ Plan Limit Reached (${user.botLimit})! Please Upgrade to Pro or VIP to add more bots.` 
            });
        }
        
        // Step 2: Validate Token Format
        if(!isValidBotToken(token)) {
            return res.json({ success: false, message: '❌ Invalid Bot Token Format. Please copy correctly from @BotFather.' });
        }

        // Step 3: Check Duplicates (Token must be unique system-wide)
        const existing = await BotModel.findOne({ token });
        if (existing) {
            return res.json({ success: false, message: '❌ This bot token is already registered on Laga Host!' });
        }

        // Step 4: Create in Database
        const newBot = await BotModel.create({ 
            ownerId: userId, 
            name: name.trim(), 
            token: token.trim() 
        });
        
        logSystem('SUCCESS', `New Bot Created: ${name} by User ${userId}`);
        res.json({ success: true, bot: newBot });

    } catch (e) {
        logSystem('ERROR', `/api/createBot: ${e.message}`);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

/**
 * 8.3 TOGGLE BOT (START/STOP)
 */
app.post('/api/toggleBot', async (req, res) => {
    try {
        const { botId, action } = req.body;
        const bot = await BotModel.findById(botId);
        
        if(!bot) return res.json({ success: false, message: 'Bot not found in database' });

        // 🛡️ Security: Check if user is allowed to run (Double check expiry)
        const user = await UserModel.findOne({ userId: bot.ownerId });
        if(action === 'start' && user.plan === 'Free') {
            const runningCount = await BotModel.countDocuments({ ownerId: bot.ownerId, status: 'RUNNING' });
            if (runningCount >= 1) {
                // Free users can only run 1 bot at a time
                // This logic is optional based on requirement, enforcing strict limit here
            }
        }

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
            // STOP ACTION
            if (activeBotInstances[botId]) {
                try {
                    activeBotInstances[botId].stop('SIGINT');
                } catch(e) { console.error('Error stopping bot instance:', e); }
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
 * 8.4 RESTART BOT (HARD RESET)
 */
app.post('/api/restartBot', async (req, res) => {
    try {
        const { botId } = req.body;
        const bot = await BotModel.findById(botId);
        
        if(!bot) return res.json({ success: false, message: 'Bot not found' });

        // Force Stop
        if (activeBotInstances[botId]) {
            try { activeBotInstances[botId].stop(); } catch(e) {}
            delete activeBotInstances[botId];
        }

        // Start Again
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
        res.json({ success: false, message: "Server Error during restart" });
    }
});

/**
 * 8.5 DELETE BOT (CLEANUP)
 */
app.post('/api/deleteBot', async (req, res) => {
    try {
        const { botId } = req.body;
        
        // Stop instance if running
        if (activeBotInstances[botId]) {
            try { activeBotInstances[botId].stop(); } catch(e){}
            delete activeBotInstances[botId];
        }
        
        // Remove Bot Data
        await BotModel.findByIdAndDelete(botId);
        
        // Remove Associated End Users to free DB space
        // This is important to keep the database clean
        await EndUserModel.deleteMany({ botId: botId }); 
        
        logSystem('WARN', `Bot Deleted ID: ${botId}`);
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// =================================================================================
// 9. EDITOR ROUTES (COMMAND MANAGEMENT)
// =================================================================================

// Get All Commands
app.post('/api/getCommands', async (req, res) => {
    try {
        const bot = await BotModel.findById(req.body.botId);
        res.json(bot ? bot.commands : {});
    } catch(e) { res.json({}) }
});

// Save Single Command (Generated from Frontend AI or Manually)
app.post('/api/saveCommand', async (req, res) => {
    try {
        const { botId, command, code } = req.body;
        // Sanitize command name (remove / and spaces)
        const cleanCmd = command.replace('/', '').replace(/\s/g, '_');
        
        // Using $set operator for atomic update of specific command field
        await BotModel.findByIdAndUpdate(botId, { 
            $set: { [`commands.${cleanCmd}`]: code } 
        });
        
        res.json({ success: true });
    } catch(e) { res.json({ success: false }) }
});

// Delete Command
app.post('/api/deleteCommand', async (req, res) => {
    try {
        const { botId, command } = req.body;
        // Using $unset operator to remove the key entirely
        await BotModel.findByIdAndUpdate(botId, { 
            $unset: { [`commands.${command}`]: "" } 
        });
        res.json({ success: true });
    } catch(e) { res.json({ success: false }) }
});

// =================================================================================
// 10. PAYMENT PROCESSING (CORE UPGRADE LOGIC)
// =================================================================================

/**
 * Handles payment submissions from the Frontend.
 * Supports: 'referral' (Points) and 'manual' (Cash/Mobile Banking).
 * Calculates the exact expiry date (30 days) and upgrades user plan.
 */
app.post('/api/submit-payment', async (req, res) => {
    const { trxId, plan, amount, userId, user, method } = req.body;

    logSystem('PAYMENT', `New Request: ${user} - ${amount} via ${method}`);

    // --- CASE A: REFERRAL REDEMPTION (AUTOMATIC) ---
    if (method === 'referral') {
        const dbUser = await UserModel.findOne({ userId });
        const requiredPoints = PLAN_LIMITS[plan].pricePoints;
        
        if (!requiredPoints) return res.json({ success: false, message: "Invalid Plan Selection" });

        if (dbUser.referrals < requiredPoints) {
            return res.json({ 
                success: false, 
                message: `Insufficient Points! Need ${requiredPoints}, Have ${dbUser.referrals}` 
            });
        }
        
        // 📅 Calculate Expiry Date (30 Days from now)
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 30); 
        
        // Apply Upgrade
        dbUser.plan = plan;
        dbUser.botLimit = PLAN_LIMITS[plan].botLimit;
        dbUser.planExpiresAt = expiry;
        dbUser.referrals -= requiredPoints; // Deduct Points
        await dbUser.save();
        
        logSystem('SUCCESS', `User ${user} redeemed ${plan} via Points. Expires: ${formatDate(expiry)}`);
        
        return res.json({ 
            success: true, 
            message: `Redeemed ${plan} Plan Successfully! Valid until ${formatDate(expiry)}` 
        });
    }

    // --- CASE B: CASH PAYMENT (MANUAL REVIEW) ---
    try {
        // Create Payment Record for Admin Review
        const payment = await PaymentModel.create({
            userId, username: user, plan, amount, trxId, method
        });

        // Notify Admin via Telegram with INLINE Buttons
        await mainBot.telegram.sendMessage(ADMIN_CONFIG.adminId, 
            `💰 <b>NEW PAYMENT REQUEST</b>\n\n` +
            `👤 <b>User:</b> @${user} (<code>${userId}</code>)\n` +
            `💎 <b>Plan:</b> ${plan}\n` +
            `💵 <b>Amount:</b> ${amount}৳\n` +
            `🧾 <b>TrxID:</b> <code>${trxId}</code>\n` +
            `💳 <b>Method:</b> ${method}\n` +
            `📅 <b>Date:</b> ${moment().format('DD MMM YYYY, h:mm A')}`,
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
// 11. CRON JOBS (AUTOMATED MAINTENANCE)
// =================================================================================

// 📅 Schedule: Every Day at Midnight (00:00)
// Checks for expired users and downgrades them automatically
cron.schedule('0 0 * * *', async () => {
    logSystem('INFO', '⏰ Running Daily Plan Expiry Check...');
    const now = new Date();
    
    try {
        // Find Expired Users
        const expiredUsers = await UserModel.find({ 
            plan: { $ne: 'Free' }, 
            planExpiresAt: { $lt: now } 
        });
        
        logSystem('INFO', `Found ${expiredUsers.length} expired subscriptions.`);

        for (const user of expiredUsers) {
            // Call the shared validator function
            await validateSubscriptionStatus(user);

            // Notify User via Telegram
            try {
                await mainBot.telegram.sendMessage(user.userId, 
                    '⚠️ <b>Subscription Expired</b>\n\n' +
                    'Your plan has expired and you have been downgraded to <b>Free</b>.\n' +
                    'Any bots exceeding the Free limit have been stopped.\n\n' +
                    'Renew now to get your bots back online!', 
                    { parse_mode: 'HTML' }
                );
            } catch(e){
                // User might have blocked the bot, ignore error
            }
        }
    } catch(err) {
        logSystem('ERROR', 'Cron Job Failed: ' + err.message);
    }
});

// =================================================================================
// 12. MAIN ADMIN BOT LOGIC (UI/UX OVERHAUL)
// =================================================================================

/**
 * Helper: Sends the Standardized Main Menu
 * Used in /start and Back buttons to ensure consistency
 * 
 * @param {Object} ctx - Telegraf Context
 * @param {boolean} isEdit - Whether to edit existing message or send new
 */
async function sendStartMenu(ctx, isEdit = false) {
    const name = ctx.from.first_name;
    const mention = `<a href="tg://user?id=${ctx.from.id}">${name}</a>`;
    
    const text = 
        `👋 <b>Hey ${mention} Welcome to Laga Host AI!</b>\n\n` +
        `🚀 <b>Your Smart Telegram Bot Hosting Companion</b>\n\n` +
        `Laga Host AI helps you:\n` +
        `• Deploy bots instantly\n` +
        `• Run them 24/7\n` +
        `• Write commands with AI (Magic Wand)\n` +
        `• Manage everything from one dashboard\n\n` +
        `<i>Whether you are a beginner or a pro — this bot is built for you.</i>\n\n` +
        `👇 <b>Choose an option below to get started:</b>`;

    // 🎯 UI LAYOUT: 6 Buttons in a clean grid
    const buttons = [
        [Markup.button.callback('📺 Watch Tutorial', 'action_tutorial')], 
        [
            Markup.button.url('🔴 YouTube', ADMIN_CONFIG.support.youtubeUrl),
            Markup.button.url('📢 Telegram', ADMIN_CONFIG.channels[0].url)
        ], 
        [
            Markup.button.callback('🛠 Support', 'action_support'),
            Markup.button.callback('📊 Status', 'action_status')
        ], 
        [Markup.button.webApp('🚀 Open Dashboard', WEB_APP_URL)]
    ];

    try {
        if (isEdit && ctx.callbackQuery) {
            await ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
        } else {
            await ctx.replyWithHTML(text, Markup.inlineKeyboard(buttons));
        }
    } catch (e) { 
        console.error('Menu Send Error:', e); 
    }
}

// 12.1 START COMMAND
mainBot.command('start', async (ctx) => {
    const args = ctx.message.text.split(' ');
    const referrerId = args[1]; // Get referral ID if present

    let user = await UserModel.findOne({ userId: ctx.from.id.toString() });
    
    if (!user) {
        // Register New User
        user = await UserModel.create({
            userId: ctx.from.id.toString(),
            username: ctx.from.username,
            firstName: ctx.from.first_name,
            photoUrl: '', // Will be updated by Frontend
            referredBy: referrerId && referrerId !== ctx.from.id.toString() ? referrerId : null
        });

        logSystem('INFO', `New User Joined via Bot: ${ctx.from.first_name}`);

        // Handle Referral Bonus Logic
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
    await sendStartMenu(ctx, false);
});

// 12.2 TUTORIAL ACTION
mainBot.action('action_tutorial', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.replyWithHTML(
        `📺 <b>How to use Laga Host?</b>\n\n` +
        `Learn how to create, host, and manage your bots in 5 minutes.\n\n` +
        `👉 <a href="${ADMIN_CONFIG.support.youtubeUrl}">Click here to Watch Tutorial</a>`,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Back', 'action_back')]])
    );
});

// 12.3 SUPPORT ACTION
mainBot.action('action_support', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.replyWithHTML(
        `🛠 <b>Laga Host Support</b>\n\n` +
        `Need help? Contact our team or join our community.\n\n` +
        `👤 <b>Admin:</b> ${ADMIN_CONFIG.support.adminUser}\n` +
        `📹 <b>YouTube:</b> <a href="${ADMIN_CONFIG.support.youtubeUrl}">Laga Tech</a>`,
        Markup.inlineKeyboard([
            [Markup.button.url('💬 Contact Admin', ADMIN_CONFIG.support.channelUrl)], 
            [Markup.button.callback('🔙 Back', 'action_back')]
        ])
    );
});

// 12.4 STATUS ACTION (AUTO-DISAPPEAR)
mainBot.action('action_status', async (ctx) => {
    await ctx.answerCbQuery("Fetching Profile...");

    const user = await UserModel.findOne({ userId: ctx.from.id });
    const botCount = await BotModel.countDocuments({ ownerId: ctx.from.id });
    const activeCount = await BotModel.countDocuments({ ownerId: ctx.from.id, status: 'RUNNING' });
    
    let expiryText = user.plan === 'Free' ? 'Lifetime' : moment(user.planExpiresAt).format('DD MMM YYYY');

    const statusText = 
        `👤 <b>USER PROFILE & STATUS</b>\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `📛 <b>Name:</b> ${user.firstName}\n` +
        `🆔 <b>ID:</b> <code>${user.userId}</code>\n` +
        `💎 <b>Plan:</b> ${user.plan}\n` +
        `📅 <b>Expires:</b> ${expiryText}\n` +
        `🤖 <b>Bots:</b> ${activeCount}/${botCount} Active\n` +
        `💰 <b>Points:</b> ${user.referrals}\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `⏳ <i>This message closes in 10 seconds...</i>`;

    // Edit message to show stats
    const sentMsg = await ctx.editMessageText(statusText, { parse_mode: 'HTML' });

    // 🎯 LOGIC: Wait 10s -> Delete -> Show Start Menu again
    setTimeout(async () => {
        try {
            await ctx.deleteMessage(); 
            // We use ctx from closure, but need to send new message
            await sendStartMenu(ctx, false); 
        } catch(e) {
            // Message might already be deleted by user
        }
    }, 10000); // 10000ms = 10 seconds
});

// 12.5 BACK ACTION
mainBot.action('action_back', async (ctx) => {
    await ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch(e){} // Clean slate
    await sendStartMenu(ctx, false);
});

// =================================================================================
// 13. ADVANCED DUAL BROADCAST SYSTEM
// =================================================================================

// 13.1 BROADCAST COMMAND HANDLER
// Allows admin to set the message and choose the target audience
mainBot.command('broadcast', async (ctx) => {
    // 1. Security Check: Only Admin can use this
    if (ctx.from.id.toString() !== ADMIN_CONFIG.adminId) {
        return ctx.reply("⛔ Unauthorized: This command is for Admins only.");
    }

    // 2. Parse Message
    const message = ctx.message.text.replace('/broadcast', '').trim();
    if (!message) {
        return ctx.reply("⚠️ Usage: <code>/broadcast Your Message Here</code> (HTML Supported)", { parse_mode: 'HTML' });
    }

    // 3. Store Message in Memory (keyed by Admin ID)
    // This allows us to retrieve it when a button is clicked
    pendingBroadcasts[ctx.from.id] = message;

    // 4. Show Selection Menu (My User vs Client User)
    await ctx.reply(
        `📢 <b>Broadcast Configuration</b>\n\n` +
        `📝 <b>Message Preview:</b>\n` +
        `<i>${message.substring(0, 50)}...</i>\n\n` +
        `👇 <b>Select Target Audience:</b>\n` +
        `👤 <b>My User:</b> People who started <b>YOUR</b> bot (Laga Host).\n` +
        `👥 <b>Client User:</b> People who use bots <b>HOSTED</b> on Laga Host.`,
        {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '👤 My User (Main Bot)', callback_data: 'cast_my_users' },
                        { text: '👥 Client User (Hosted Bots)', callback_data: 'cast_client_users' }
                    ],
                    [{ text: '❌ Cancel', callback_data: 'cast_cancel' }]
                ]
            }
        }
    );
});

// 13.2 CANCEL BROADCAST
mainBot.action('cast_cancel', async (ctx) => {
    delete pendingBroadcasts[ctx.from.id];
    await ctx.deleteMessage();
    await ctx.answerCbQuery("Broadcast Cancelled");
});

// 13.3 BROADCAST ACTION: MY USERS (MAIN BOT)
mainBot.action('cast_my_users', async (ctx) => {
    await ctx.answerCbQuery("Starting Main User Broadcast...");
    const message = pendingBroadcasts[ctx.from.id];

    if (!message) {
        return ctx.reply("⚠️ Session expired. Please type /broadcast again.");
    }

    await ctx.deleteMessage();
    const statusMsg = await ctx.reply("⏳ <b>Broadcasting to MY USERS...</b>\nPlease wait, this may take time.", { parse_mode: 'HTML' });

    let stats = { sent: 0, blocked: 0, errors: 0 };
    const cursor = UserModel.find().cursor();

    logSystem('BROADCAST', 'Started: Main Users Broadcast');

    for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
        try {
            await mainBot.telegram.sendMessage(doc.userId, message, { parse_mode: 'HTML' });
            stats.sent++;
            await sleep(35); // Rate limiting (30 messages per second approx)
        } catch (e) {
            stats.errors++;
            if (e.code === 403 || e.description.includes('blocked')) {
                stats.blocked++;
                // Optional: Mark user as inactive/banned in DB
            }
        }
    }

    // Clean up
    delete pendingBroadcasts[ctx.from.id];
    
    // Final Report
    await ctx.telegram.editMessageText(
        ctx.chat.id, 
        statusMsg.message_id, 
        null,
        `✅ <b>Main User Broadcast Complete</b>\n\n` +
        `📨 Delivered: <b>${stats.sent}</b>\n` +
        `🚫 Blocked/Inactive: <b>${stats.blocked}</b>\n` +
        `❌ Errors: <b>${stats.errors}</b>`,
        { parse_mode: 'HTML' }
    );
    
    logSystem('BROADCAST', `Finished Main Users: ${stats.sent} sent.`);
});

// 13.4 BROADCAST ACTION: CLIENT USERS (HOSTED BOTS)
mainBot.action('cast_client_users', async (ctx) => {
    await ctx.answerCbQuery("Starting Client User Broadcast...");
    const message = pendingBroadcasts[ctx.from.id];

    if (!message) {
        return ctx.reply("⚠️ Session expired. Please type /broadcast again.");
    }

    await ctx.deleteMessage();
    const statusMsg = await ctx.reply("⏳ <b>Broadcasting to CLIENT USERS...</b>\nScanning active bots...", { parse_mode: 'HTML' });

    let stats = { sent: 0, skippedOwners: 0, errors: 0 };
    
    logSystem('BROADCAST', 'Started: Client Users Broadcast');

    try {
        // Only broadcast via bots that are currently RUNNING
        const runningBots = await BotModel.find({ status: 'RUNNING' });

        for (const bot of runningBots) {
            // Find users for this specific hosted bot
            const endUsers = await EndUserModel.find({ botId: bot._id.toString() });
            
            if(endUsers.length === 0) continue;

            // Get the bot instance to send message
            let senderBot = activeBotInstances[bot._id.toString()];
            if (!senderBot) {
                // If not in RAM, try to init strictly for sending
                try { senderBot = new Telegraf(bot.token); } catch(e) { continue; }
            }

            // Loop through end users of this bot
            for (const eu of endUsers) {
                // 🛡️ SKIP OWNER & ADMIN (As per previous logic)
                if (eu.tgId === bot.ownerId || eu.tgId === ADMIN_CONFIG.adminId) {
                    stats.skippedOwners++;
                    continue; 
                }

                try {
                    await senderBot.telegram.sendMessage(eu.tgId, message, { parse_mode: 'HTML' });
                    stats.sent++;
                    await sleep(50); // Slower rate limit for child bots to prevent hitting API limits
                } catch(e) {
                    stats.errors++;
                    // If blocked, remove from EndUser DB to clean up
                    if(e.code === 403 || e.code === 400) {
                        await EndUserModel.findByIdAndDelete(eu._id);
                    }
                }
            }
        }
    } catch(e) { 
        console.error('Broadcast Error', e); 
        logSystem('ERROR', `Broadcast Crash: ${e.message}`);
    }

    // Clean up
    delete pendingBroadcasts[ctx.from.id];

    // Final Report
    await ctx.telegram.editMessageText(
        ctx.chat.id, 
        statusMsg.message_id, 
        null,
        `✅ <b>Client User Broadcast Complete</b>\n\n` +
        `📨 Delivered to End Users: <b>${stats.sent}</b>\n` +
        `🛡️ Owners Skipped: <b>${stats.skippedOwners}</b>\n` +
        `❌ Errors/Cleaned: <b>${stats.errors}</b>`,
        { parse_mode: 'HTML' }
    );

    logSystem('BROADCAST', `Finished Client Users: ${stats.sent} sent.`);
});

// =================================================================================
// 14. ADMIN STATS & PAYMENT HANDLERS
// =================================================================================

// 14.1 ADMIN STATS COMMAND
mainBot.command('stats', async (ctx) => {
    if(ctx.from.id.toString() !== ADMIN_CONFIG.adminId) return;

    const userCount = await UserModel.countDocuments();
    const botCount = await BotModel.countDocuments();
    const runCount = await BotModel.countDocuments({ status: 'RUNNING' });
    const paidCount = await UserModel.countDocuments({ plan: { $ne: 'Free' } });
    const endUserCount = await EndUserModel.countDocuments(); // Total Client Users

    ctx.replyWithHTML(
        `📊 <b>System Statistics</b>\n\n` +
        `👤 My Users: <b>${userCount}</b>\n` +
        `👥 Client Users: <b>${endUserCount}</b>\n` +
        `🤖 Total Bots: <b>${botCount}</b>\n` +
        `🟢 Running: <b>${runCount}</b>\n` +
        `💎 Premium Users: <b>${paidCount}</b>`
    );
});

// 14.2 PAYMENT CALLBACKS (APPROVE/DECLINE)
// This handles button clicks inside the Admin channel for payment verification
mainBot.action(/^approve:(\d+):(\w+):(.+)$/, async (ctx) => {
    try {
        const userId = ctx.match[1];
        const plan = ctx.match[2];
        const payId = ctx.match[3];
        
        // Limits from config
        const limits = PLAN_LIMITS[plan] || PLAN_LIMITS['Free'];
        
        // 📅 Expiry Logic: Add 30 Days from NOW
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + limits.validityDays);

        // DB Update
        await UserModel.findOneAndUpdate(
            { userId }, 
            { 
                plan, 
                botLimit: limits.botLimit, 
                planExpiresAt: expiry // Crucial update
            }
        );
        
        await PaymentModel.findByIdAndUpdate(payId, { status: 'APPROVED', adminResponseDate: new Date() });

        // Admin Notification Update
        await ctx.editMessageText(
            `${ctx.callbackQuery.message.text}\n\n✅ <b>APPROVED</b> by ${ctx.from.first_name}\nValid until: ${formatDate(expiry)}`, 
            { parse_mode: 'HTML' }
        );

        // User Notification
        await mainBot.telegram.sendMessage(userId, 
            `✅ <b>Payment Approved!</b>\n\n` +
            `You have been upgraded to <b>${plan}</b> plan.\n` +
            `Bot Limit: ${limits.botLimit}\n` +
            `Valid until: ${formatDate(expiry)}`, 
            { parse_mode: 'HTML' }
        );
        
        logSystem('PAYMENT', `Approved Upgrade for ${userId} to ${plan}`);

    } catch(e) { console.error(e); }
});

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
        
        logSystem('PAYMENT', `Declined Payment for ${userId}`);
    } catch(e) { console.error(e); }
});

// =================================================================================
// 15. STARTUP SEQUENCE & SYSTEM RECOVERY
// =================================================================================

/**
 * STARTUP SEQUENCE
 * 1. Connect DB (Done above in async flow)
 * 2. Restore Sessions (Active Bots)
 * 3. Start Main Bot
 * 4. Start Express HTTP Server
 */

// A. Restore Active Bot Sessions when DB opens
mongoose.connection.once('open', async () => {
    const runningBots = await BotModel.find({ status: 'RUNNING' });
    
    if(runningBots.length > 0) {
        logSystem('INFO', `Found ${runningBots.length} bots to restore...`);
        
        let restoredCount = 0;
        for (const bot of runningBots) {
            // Slight delay to prevent CPU spike during mass restart
            await sleep(200);
            
            // Re-validate expiry before restoring
            const user = await UserModel.findOne({ userId: bot.ownerId });
            if (user && user.planExpiresAt && new Date() > new Date(user.planExpiresAt)) {
                 logSystem('WARN', `Skipping restoration for expired user: ${user.userId}`);
                 bot.status = 'STOPPED';
                 await bot.save();
                 continue;
            }

            const res = await startBotEngine(bot);
            if(res.success) restoredCount++;
        }
        
        logSystem('SUCCESS', `Restored ${restoredCount}/${runningBots.length} active bot sessions.`);
    } else {
        logSystem('INFO', 'No active bots to restore.');
    }
});

// B. Launch Main Admin Bot
mainBot.launch({ dropPendingUpdates: true })
    .then(() => logSystem('SUCCESS', 'Main Admin Bot is Online'))
    .catch(err => logSystem('ERROR', 'Main Bot Launch Fail: ' + err.message));

// C. Serve Frontend (SPA Fallback for History Mode)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// D. Graceful Shutdown Handling (Clean up RAM & DB connections)
const shutdown = (signal) => {
    logSystem('WARN', `${signal} received. Shutting down securely...`);
    
    // Stop Main Bot
    mainBot.stop(signal);
    
    // Stop All Hosted Bots
    Object.values(activeBotInstances).forEach(bot => {
        try { bot.stop(signal); } catch(e) {}
    });
    
    // Close DB
    mongoose.connection.close(false, () => {
        logSystem('DB', 'Database connection closed.');
        process.exit(0);
    });
};

// Listen for termination signals
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

// =================================================================================
// 16. SYSTEM HEALTH & MONITORING
// =================================================================================

// Simple health check route for Uptime Monitors (e.g. UptimeRobot)
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        uptime: process.uptime(),
        timestamp: new Date()
    });
});

// E. Start Express Server
app.listen(PORT, () => {
    logSystem('SUCCESS', `-------------------------------------------`);
    logSystem('SUCCESS', `LAGA HOST SERVER RUNNING ON PORT ${PORT}`);
    logSystem('SUCCESS', `DASHBOARD URL: ${WEB_APP_URL}`);
    logSystem('SUCCESS', `ENV: ${process.env.NODE_ENV || 'Development'}`);
    logSystem('SUCCESS', `-------------------------------------------`);
});
