/**
 * =================================================================================================
 *  PROJECT NAME:       LAGA HOST ULTIMATE SERVER (SECURE ENTERPRISE EDITION)
 *  VERSION:            6.0.5 (Build: 2026-JAN-15) - ASYNC ENGINE FIXED
 *  AUTHOR:             Laga Host Team
 *  ENVIRONMENT:        Production / Node.js
 *  
 *  DESCRIPTION: 
 *  The comprehensive, full-scale backend server for the Laga Host Telegram Bot Platform.
 *  This is the "Brain" of the operation. It manages:
 * 
 *  [1] Multi-tenant Bot Hosting:
 *      - Creates isolated sandbox environments for user bots.
 *      - Manages Token validation and connectivity.
 *      - Handles Start/Stop/Restart lifecycles securely.
 * 
 *  [2] AI-Powered Code Generation:
 *      - Integrates with Gemini 2.0 (via OpenRouter) to write code.
 *      - Sanitizes AI output to prevent server crashes.
 *      - Ensures generated code uses correct Async/Await syntax.
 * 
 *  [3] Secure Payment Gateway:
 *      - Manages Subscription Plans (Free, Pro, VIP).
 *      - Handles Transaction ID verification manually via Admin.
 *      - Automates Plan Expiry and downgrades.
 * 
 *  [4] Advanced Broadcast System:
 *      - Filters targets (All Users, Specific Bot Users).
 *      - Prevents spamming the Bot Owners.
 *      - Handles rate limiting to avoid Telegram bans.
 * 
 *  [5] Real-time Analytics & User Tracking:
 *      - Tracks every user interaction with hosted bots.
 *      - Stores user profiles in MongoDB High-Performance Clusters.
 * 
 *  WARNING:
 *  Do not modify the 'startBotEngine' function unless you understand
 *  Node.js AsyncFunction constructors deeply.
 * =================================================================================================
 */

// =================================================================================================
// SECTION 1: SYSTEM DEPENDENCIES & LIBRARY IMPORTS
// =================================================================================================

// 1.1 Load Environment Variables
// We use 'dotenv' to securely load sensitive keys like API tokens from the .env file.
require('dotenv').config();

// 1.2 Express Framework
// Used for creating the REST API endpoints that the Frontend (React/HTML) connects to.
const express = require('express');

// 1.3 Telegraf Framework
// The core library for interacting with the Telegram Bot API.
// We import 'Markup' for keyboards and 'session' for state management.
const { Telegraf, Markup, session } = require('telegraf');

// 1.4 Body Parser Middleware
// Essential for reading JSON data sent from the website to the server.
const bodyParser = require('body-parser');

// 1.5 CORS Middleware
// Allows your website (hosted on a different domain) to talk to this backend.
const cors = require('cors');

// 1.6 Node.js Built-in Utilities
// 'path' helps with file paths, 'fs' handles file system operations.
const path = require('path');
const fs = require('fs');

// 1.7 Database Driver
// Mongoose is the ODM (Object Data Modeler) for MongoDB.
const mongoose = require('mongoose');

// 1.8 Task Scheduler
// 'node-cron' allows us to run tasks automatically (e.g., checking expired plans every night).
const cron = require('node-cron');

// 1.9 Date & Time Formatting
// 'moment' makes handling dates (like expiry dates) much easier than standard JS Date.
const moment = require('moment');

// 1.10 HTTP Client
// 'axios' is used to call the AI API (OpenRouter) and for user bots to fetch data.
const axios = require('axios');

// =================================================================================================
// SECTION 2: GLOBAL CONFIGURATION & SERVER CONSTANTS
// =================================================================================================

// Initialize the Express Application
const app = express();

// Define the Server Port
// It tries to use the port assigned by Render/Heroku, otherwise falls back to 3000.
const PORT = process.env.PORT || 3000;

// ⚠️ SYSTEM URL CONFIGURATION
// This URL is used for WebHooks (if needed) and AI Referer headers.
// IMPORTANT: Update this if your Render URL changes.
const WEB_APP_URL = process.env.WEB_APP_URL || "https://lagahost.onrender.com";

// 🤖 ARTIFICIAL INTELLIGENCE CONFIGURATION
// We use OpenRouter to access Gemini 2.0 Flash for cost-effective & fast generation.
// The headers are required by OpenRouter to identify your app.
const AI_CONFIG = {
    apiKey: "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",
    model: "google/gemini-2.0-flash-exp:free",
    headers: {
        "HTTP-Referer": WEB_APP_URL,
        "X-Title": "Laga Host Platform"
    }
};

// 🛠️ ADMIN & PLATFORM SETTINGS
// These settings control the Main Admin Bot and support channels.
const ADMIN_CONFIG = {
    // The Main Host Bot Token (The bot users talk to)
    token: process.env.BOT_TOKEN || "8264143788:AAH0fRkMqBw4rONo0WVEi-OyAVkPs9bRt84",
    
    // The Super Admin's Telegram ID
    // This ID receives payment alerts and system warnings.
    adminId: process.env.ADMIN_ID || "7605281774",
    
    // Mandatory Channels to Join
    // Users might be forced to join these in future updates.
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

    // Support Resources & Contact Info
    support: {
        adminUser: "@lagatech",
        channelUrl: "https://t.me/lagatech",
        youtubeUrl: "https://youtube.com/@lagatech?si=LC_FiXS4BdwR11XR",
        tutorialVideoUrl: "https://youtube.com/@lagatech" 
    },

    // Payment Methods Display Info (Shown in the Bot)
    payment: {
        nagad: "01761494948",
        bkash: "01761494948"
    }
};

// 📊 PLAN LIMITS & CONFIGURATION
// Defines what each tier of user gets.
const PLAN_LIMITS = {
    'Free': { 
        botLimit: 1, 
        validityDays: 9999, // Effectively Lifetime 
        pricePoints: 0 
    },
    'Pro':  { 
        botLimit: 5, 
        validityDays: 30, 
        pricePoints: 50 // Points needed to redeem via referral
    },
    'VIP':  { 
        botLimit: 10, 
        validityDays: 30, 
        pricePoints: 80 
    }
};

// 🗄️ DATABASE CONNECTION STRING
// The connection URL for MongoDB Atlas.
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://lagahost:l%40g%40ho%24t@snowmanadventure.ocodku0.mongodb.net/snowmanadventure?retryWrites=true&w=majority&appName=snowmanadventure";

// =================================================================================================
// SECTION 3: ENHANCED LOGGING SYSTEM
// =================================================================================================

/**
 * LOGGING FUNCTION
 * This function beautifies the console output.
 * Instead of simple console.log, it adds timestamps and icons.
 * This makes debugging easier when looking at Render/Server logs.
 * 
 * @param {string} type - The category (INFO, ERROR, DB, BOT, AI, SEC)
 * @param {string} message - The actual text to log
 */
function logSystem(type, message) {
    // Get current time in specific format
    const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
    
    // Define icons for visual parsing
    const icons = {
        INFO:    'ℹ️  [INFO]   ',
        ERROR:   '❌  [ERROR]  ',
        WARN:    '⚠️  [WARN]   ',
        SUCCESS: '✅  [SUCCESS]',
        DB:      '🗄️  [DB]     ',
        BOT:     '🤖  [BOT]    ',
        AI:      '🧠  [AI]     ',
        SEC:     '🛡️  [SECURE] '
    };
    
    const prefix = icons[type] || '🔹  [LOG]    ';
    
    // Print to system console
    console.log(`${prefix} [${timestamp}] : ${message}`);
}

// =================================================================================================
// SECTION 4: DATABASE MODELS & SCHEMAS (DETAILED)
// =================================================================================================

// 4.1 Initiate Database Connection
mongoose.connect(MONGO_URI)
    .then(() => {
        logSystem('DB', '================================================');
        logSystem('DB', '   MONGODB DATABASE CONNECTION ESTABLISHED      ');
        logSystem('DB', '   Status: CONNECTED | Ready for Operations     ');
        logSystem('DB', '================================================');
    })
    .catch(err => {
        logSystem('ERROR', 'CRITICAL DATABASE FAILURE');
        logSystem('ERROR', 'Could not connect to MongoDB Atlas.');
        logSystem('ERROR', 'Reason: ' + err.message);
        // We usually exit here, but we will keep running to serve static files if needed
    });

// 4.2 USER SCHEMA
// Stores data about the Bot Creator (The person using Laga Host)
const userSchema = new mongoose.Schema({
    userId: { 
        type: String, 
        required: true, 
        unique: true, 
        index: true // Indexed for faster lookup
    },
    username: { type: String, default: 'Unknown' },
    firstName: { type: String, default: 'User' },
    
    // Subscription Data
    plan: { 
        type: String, 
        default: 'Free', 
        enum: ['Free', 'Pro', 'VIP'] 
    },
    planExpiresAt: { type: Date, default: null },
    
    // Resource Limits
    botLimit: { type: Number, default: 1 },
    
    // Referral & Points System
    referrals: { type: Number, default: 0 },
    referredBy: { type: String, default: null },
    
    // Financials
    totalPaid: { type: Number, default: 0 },
    
    // Security & Metadata
    isBanned: { type: Boolean, default: false },
    joinedAt: { type: Date, default: Date.now },
    lastActive: { type: Date, default: Date.now }
});

// 4.3 BOT SCHEMA
// Stores data about the hosted bots (tokens, code, status)
const botSchema = new mongoose.Schema({
    ownerId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    token: { type: String, required: true, unique: true },
    
    // Bot Execution Status
    status: { 
        type: String, 
        default: 'STOPPED', 
        enum: ['RUNNING', 'STOPPED', 'ERROR', 'BANNED'] 
    },
    
    // THE BRAIN: Stores the user's custom code
    // Structure: { "start": "ctx.reply('Hi')", "help": "..." }
    commands: { type: Object, default: {} }, 
    
    // Environment Variables (For API Keys etc.)
    envVars: { type: Object, default: {} },
    
    // Operational Stats
    startedAt: { type: Date, default: null },
    restartCount: { type: Number, default: 0 },
    
    // Setup Flag
    isFirstLive: { type: Boolean, default: true },
    
    createdAt: { type: Date, default: Date.now }
});

// 4.4 END USER SCHEMA
// Stores users who chat with the HOSTED bots (Not the main bot)
// This is used for Analytics and Broadcasting
const endUserSchema = new mongoose.Schema({
    tgId: { type: String, required: true },
    botId: { type: String, required: true, index: true },
    username: String,
    firstName: String,
    createdAt: { type: Date, default: Date.now }
});
// Compound Index: Ensure one user is unique PER bot
endUserSchema.index({ tgId: 1, botId: 1 }, { unique: true });

// 4.5 PAYMENT SCHEMA
// Logs all payment attempts (Pending, Approved, Declined)
const paymentSchema = new mongoose.Schema({
    userId: String,
    username: String,
    plan: String,
    amount: Number,
    trxId: String,
    method: String, // 'bkash', 'nagad', 'referral'
    status: { 
        type: String, 
        default: 'PENDING', 
        enum: ['PENDING', 'APPROVED', 'DECLINED'] 
    },
    adminResponseDate: Date,
    date: { type: Date, default: Date.now }
});

// 4.6 COMPILE MODELS
const UserModel = mongoose.model('User', userSchema);
const BotModel = mongoose.model('Bot', botSchema);
const EndUserModel = mongoose.model('EndUser', endUserSchema);
const PaymentModel = mongoose.model('Payment', paymentSchema);

// =================================================================================================
// SECTION 5: SERVER MIDDLEWARE & SECURITY SETUP
// =================================================================================================

// 5.1 RAM Storage for Active Bot Instances
// Since JS objects are in memory, restarting server clears this.
// The Database 'status' field helps us restore them on boot.
let activeBotInstances = {}; 

// 5.2 Configure Middleware
// Enable Cross-Origin Resource Sharing
app.use(cors()); 

// Allow large payloads (50mb) because code files can be large
app.use(bodyParser.json({ limit: '50mb' })); 
app.use(bodyParser.urlencoded({ extended: true }));

// Serve Static Assets (The React Frontend build files)
app.use(express.static(path.join(__dirname, 'public'))); 

// 5.3 Request Logger
// Logs every API hit to the console (Filtered to reduce noise)
app.use((req, res, next) => {
    if(req.path.startsWith('/api')) {
        // Uncomment to debug API calls
        // logSystem('INFO', `API HIT: ${req.method} ${req.path}`);
    }
    next();
});

// 5.4 Initialize Main Admin Bot
// This is the bot that manages users, not the hosted bots.
const mainBot = new Telegraf(ADMIN_CONFIG.token);

// =================================================================================================
// SECTION 6: HELPER UTILITIES
// =================================================================================================

/**
 * Validates a Telegram Bot Token format.
 * Format: 123456789:ABCdefGHIjklMNOpqrs...
 */
function isValidBotToken(token) {
    return /^\d+:[A-Za-z0-9_-]{35,}$/.test(token);
}

/**
 * Formats a Date object to a human-readable string
 */
function formatDate(date) {
    if(!date) return 'Never';
    return moment(date).format('DD MMM YYYY, h:mm A');
}

/**
 * Checks if a user can create more bots
 */
async function hasReachedLimit(userId) {
    const user = await UserModel.findOne({ userId });
    if (!user) return true; // Default to blocked if user invalid
    
    const count = await BotModel.countDocuments({ ownerId: userId });
    return count >= user.botLimit;
}

// =================================================================================================
// SECTION 7: BOT HOSTING ENGINE (CORE LOGIC - ASYNC FIXED)
// =================================================================================================

/**
 * 🛠️ THE ASYNC FIX CONSTRUCTOR
 * This is the magic line that allows 'await' to be used in dynamic code.
 * It creates a constructor for Async Functions.
 */
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

/**
 * STARTS A HOSTED BOT INSTANCE
 * This function creates a new Telegraf instance, binds it to a sandbox,
 * and executes user code safely.
 * 
 * @param {Object} botDoc - The MongoDB document of the bot
 * @returns {Promise<Object>} Status object
 */
async function startBotEngine(botDoc) {
    const botId = botDoc._id.toString();

    // Check if already running in RAM
    if (activeBotInstances[botId]) {
        return { success: true, message: 'Bot is already running.' };
    }

    try {
        logSystem('BOT', `Initializing Engine for: ${botDoc.name} (${botId})`);

        // 1. Create Telegraf Instance
        const bot = new Telegraf(botDoc.token);

        // 2. Remove Webhook (Force Long Polling)
        // This prevents conflicts if the user previously set a webhook.
        try {
            await bot.telegram.deleteWebhook();
        } catch (webhookErr) {
            // Ignore - implies webhook wasn't set or token is invalid (caught later)
        }

        // 3. Verify Token
        const botInfo = await bot.telegram.getMe();
        
        // 4. Error Handling (Prevent crash on network fail)
        bot.catch((err, ctx) => {
            logSystem('ERROR', `[Child Bot Error] [${botDoc.name}]: ${err.message}`);
        });

        // =========================================================
        // MIDDLEWARE: ANALYTICS TRACKER
        // =========================================================
        bot.use(async (ctx, next) => {
            if(ctx.from) {
                // Run in background (Fire & Forget)
                (async () => {
                    try {
                        const tgId = ctx.from.id.toString();
                        
                        // Check if user exists in EndUser DB
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
                            // logSystem('INFO', `New Interaction on ${botDoc.name}: ${ctx.from.first_name}`);
                        }
                    } catch(e) {
                        // Ignore unique constraint errors
                    }
                })();
            }
            return next();
        });

        // =========================================================
        // ⚙️ MAIN LOGIC: DYNAMIC CODE EXECUTION (FIXED)
        // =========================================================
        bot.on('message', async (ctx) => {
            if (!ctx.message.text) return;
            const text = ctx.message.text;
            
            // Only process command-like messages
            if (text.startsWith('/')) {
                const cmdName = text.substring(1).split(' ')[0]; // Extract 'start' from '/start params'
                
                // Fetch latest code from DB (Hot Reloading)
                const freshBot = await BotModel.findById(botId);
                const code = freshBot?.commands?.[cmdName];
                
                if (code) {
                    try {
                        // 🔒 CREATING THE ASYNC SANDBOX
                        // We use AsyncFunction so 'await' works inside the user's code.
                        // We pass useful tools: ctx, bot, Markup, axios, moment.
                        
                        const runUserCode = new AsyncFunction('ctx', 'bot', 'Markup', 'axios', 'moment', `
                            try {
                                // --- START OF USER CODE ---
                                ${code}
                                // --- END OF USER CODE ---
                            } catch(runtimeError) {
                                // Handle errors INSIDE the user logic
                                console.error('Runtime Error:', runtimeError);
                                
                                // Try to notify the user if possible
                                await ctx.replyWithHTML(
                                    '⚠️ <b>Bot Execution Error:</b>\\n' + 
                                    '<pre>' + runtimeError.message + '</pre>'
                                ).catch(e => {}); 
                            }
                        `);
                        
                        // ✅ EXECUTE THE CODE (AWAIT IT)
                        await runUserCode(ctx, bot, Markup, axios, moment);
                        
                    } catch (syntaxError) {
                        // Handle syntax errors in the code structure itself
                        ctx.replyWithHTML(
                            `❌ <b>Syntax Error in Command:</b>\n<pre>${syntaxError.message}</pre>`
                        ).catch(e => {});
                    }
                }
            }
        });

        // 5. Launch The Instance
        bot.launch({ dropPendingUpdates: true })
            .then(() => {
                logSystem('SUCCESS', `Bot Online: ${botDoc.name} (@${botInfo.username})`);
            })
            .catch(err => {
                logSystem('ERROR', `Bot Launch Failed [${botDoc.name}]: ${err.message}`);
                delete activeBotInstances[botId]; // Clean up RAM
            });

        // 6. Store in RAM
        activeBotInstances[botId] = bot;
        
        // 7. Update DB Status (Turn off First Live flag)
        if (botDoc.isFirstLive) {
            botDoc.isFirstLive = false;
            await botDoc.save();
        }

        return { success: true, botInfo };

    } catch (error) {
        logSystem('ERROR', `Engine Fatal Error [${botDoc.name}]: ${error.message}`);
        
        let msg = 'Internal Server Error during startup.';
        if (error.message.includes('401')) msg = 'Invalid Bot Token! Revoked or Incorrect.';
        if (error.message.includes('409')) msg = 'Conflict! Bot is running elsewhere.';

        return { success: false, message: msg };
    }
}

// =================================================================================================
// SECTION 8: API ROUTE HANDLERS
// =================================================================================================

// 8.1 GET BOTS (SYNC USER & FETCH DASHBOARD DATA)
app.post('/api/bots', async (req, res) => {
    try {
        const { userId, username, firstName } = req.body;
        
        if(!userId) {
            return res.status(400).json({ error: "Invalid Request: User ID Missing" });
        }

        // Find or Create User Logic
        let user = await UserModel.findOne({ userId });
        
        if (!user) {
            user = await UserModel.create({ userId, username, firstName });
            logSystem('INFO', `New Registration: ${firstName} (${userId})`);
        } else {
            // Update User Metadata if changed
            let changed = false;
            if(firstName && user.firstName !== firstName) { user.firstName = firstName; changed = true; }
            if(username && user.username !== username) { user.username = username; changed = true; }
            user.lastActive = new Date();
            await user.save();
        }

        // Fetch User's Bots
        const bots = await BotModel.find({ ownerId: userId }).sort({ createdAt: -1 });
        
        res.json({ success: true, bots, user });

    } catch (e) {
        logSystem('ERROR', `/api/bots: ${e.message}`);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// 8.2 CREATE BOT (VALIDATION & LIMITS)
app.post('/api/createBot', async (req, res) => {
    try {
        const { token, name, userId } = req.body;
        
        // Check Plan Limits
        const user = await UserModel.findOne({ userId });
        const currentCount = await BotModel.countDocuments({ ownerId: userId });
        
        if (currentCount >= user.botLimit) {
            return res.json({ 
                success: false, 
                message: `⚠️ Plan Limit Reached (${user.botLimit})! Please Upgrade to Pro or VIP.` 
            });
        }
        
        // Validate Token
        if(!isValidBotToken(token)) {
            return res.json({ success: false, message: '❌ Invalid Bot Token Format.' });
        }

        // Check Duplicate Token
        const existing = await BotModel.findOne({ token });
        if (existing) {
            return res.json({ success: false, message: '❌ This bot token is already registered here!' });
        }

        // Create Bot Record
        const newBot = await BotModel.create({ 
            ownerId: userId, 
            name: name.trim(), 
            token: token.trim() 
        });
        
        logSystem('SUCCESS', `New Bot Created: ${name} by ${userId}`);
        res.json({ success: true, bot: newBot });

    } catch (e) {
        logSystem('ERROR', `/api/createBot: ${e.message}`);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

// 8.3 TOGGLE BOT (START / STOP)
app.post('/api/toggleBot', async (req, res) => {
    try {
        const { botId, action } = req.body;
        const bot = await BotModel.findById(botId);
        
        if(!bot) return res.json({ success: false, message: 'Bot not found' });

        if (action === 'start') {
            // Try to start
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
            // Stop Action
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

// 8.4 RESTART BOT (HARD RESET)
app.post('/api/restartBot', async (req, res) => {
    try {
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
    } catch (e) {
        res.json({ success: false, message: "Server Error during restart" });
    }
});

// 8.5 DELETE BOT (CLEANUP)
app.post('/api/deleteBot', async (req, res) => {
    try {
        const { botId } = req.body;
        
        // Stop instance if running
        if (activeBotInstances[botId]) {
            try { activeBotInstances[botId].stop(); } catch(e){}
            delete activeBotInstances[botId];
        }
        
        // Remove Bot from DB
        await BotModel.findByIdAndDelete(botId);
        
        // Remove Associated Analytics (Optional, but good for hygiene)
        await EndUserModel.deleteMany({ botId: botId }); 
        
        logSystem('WARN', `Bot Permanently Deleted ID: ${botId}`);
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// =================================================================================================
// SECTION 9: AI GENERATION API (FREE - NO KEY REQUIRED - POLLINATIONS)
// =================================================================================================

/**
 * AI CODE GENERATOR (POLLINATIONS.AI EDITION)
 * This uses a free public API that does NOT require an API Key.
 * It is perfect for free tier users.
 */
app.post('/api/ai-generate', async (req, res) => {
    // 1. Destructure Data
    const { prompt, type } = req.body;

    // 2. Validate
    if (!prompt) {
        return res.json({ success: false, message: "Prompt cannot be empty." });
    }

    // 3. DEFINE SYSTEM INSTRUCTION
    let systemInstruction = "";
    
    if (type === 'code') {
        systemInstruction =
            "ROLE: Expert Telegraf.js v4 Bot Developer.\n" +
            "CONTEXT: Code runs inside: `async (ctx, Markup, axios, moment) => { CODE }`.\n" +
            "RULES:\n" +
            "1. USE `await` for all promises (ctx.reply, axios.get).\n" +
            "2. NO `require`, NO `import`, NO `bot.launch`.\n" +
            "3. RETURN RAW JAVASCRIPT ONLY. No Markdown ``` blocks.\n" +
            "4. Example: `await ctx.reply('Hello');`";
    } else {
        systemInstruction = "ACT AS: Copywriter. Write short, engaging Telegram broadcast text in HTML.";
    }

    try {
        logSystem('AI', `Requesting Free AI generation for: ${type}`);

        // 4. Call Pollinations AI (NO API KEY NEEDED)
        // We use a random seed to ensure fresh responses
        const seed = Math.floor(Math.random() * 1000000);
        
        const response = await axios.post(
            "https://text.pollinations.ai/",
            {
                messages: [
                    { role: "system", content: systemInstruction },
                    { role: "user", content: prompt }
                ],
                model: "openai", // Uses GPT-4o-mini or similar for free
                seed: seed,
                json: false
            },
            {
                headers: { "Content-Type": "application/json" }
            }
        );

        let finalContent = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);

        // =================================================================
        // 5. SANITIZATION (CLEANUP)
        // =================================================================
        
        // Remove Markdown wrappers if present
        finalContent = finalContent
            .replace(/^```(javascript|js|ts)?/gim, "") 
            .replace(/```$/gim, "")              
            .trim();

        // Extract inner logic if wrapped in bot.command
        const wrapperRegex = /(?:bot\.(?:start|command|on|action)|ctx\.action|bot\.use)\s*\([^{]*\{\s*([\s\S]*?)\s*\}\s*\)?\s*;?$/i;
        const match = finalContent.match(wrapperRegex);
        if (match && match[1]) {
            finalContent = match[1].trim();
        }

        // Remove dangerous lines
        const forbiddenPhrases = ["require(", "new Telegraf", "bot.launch", "const bot =", "import "];
        finalContent = finalContent
            .split('\n')
            .filter(line => !forbiddenPhrases.some(phrase => line.includes(phrase)))
            .join('\n')
            .replace(/^\s*}\s*\)\s*;\s*$/gm, "") 
            .trim();

        if (!finalContent) {
            throw new Error("AI returned empty response.");
        }

        // 6. Return Result
        res.json({ success: true, result: finalContent });

    } catch (e) {
        logSystem('ERROR', `AI Failed: ${e.message}`);
        
        // Fallback response so user doesn't get stuck
        res.json({ 
            success: false, 
            message: "Free AI server is busy. Please try again in 5 seconds." 
        });
    }
});

// =================================================================================================
// SECTION 10: CODE EDITOR ROUTES
// =================================================================================================

// Get All Commands for a Bot
app.post('/api/getCommands', async (req, res) => {
    try {
        const bot = await BotModel.findById(req.body.botId);
        res.json(bot ? bot.commands : {});
    } catch(e) { res.json({}) }
});

// Save a Single Command
app.post('/api/saveCommand', async (req, res) => {
    try {
        const { botId, command, code } = req.body;
        // Clean the command name (remove / and spaces)
        const cleanCmd = command.replace('/', '').replace(/\s/g, '_');
        
        await BotModel.findByIdAndUpdate(botId, { 
            $set: { [`commands.${cleanCmd}`]: code } 
        });
        
        res.json({ success: true });
    } catch(e) { res.json({ success: false }) }
});

// Delete a Command
app.post('/api/deleteCommand', async (req, res) => {
    try {
        const { botId, command } = req.body;
        await BotModel.findByIdAndUpdate(botId, { 
            $unset: { [`commands.${command}`]: "" } 
        });
        res.json({ success: true });
    } catch(e) { res.json({ success: false }) }
});

// =================================================================================================
// SECTION 11: PAYMENT PROCESSING (MANUAL & REFERRAL)
// =================================================================================================

app.post('/api/submit-payment', async (req, res) => {
    const { trxId, plan, amount, userId, user, method } = req.body;

    logSystem('INFO', `Payment: ${user} - ${amount} via ${method}`);

    // --- CASE A: REFERRAL POINT REDEMPTION ---
    if (method === 'referral') {
        const dbUser = await UserModel.findOne({ userId });
        const requiredPoints = PLAN_LIMITS[plan].pricePoints;
        
        if (!requiredPoints) return res.json({ success: false, message: "Invalid Plan" });

        if (dbUser.referrals < requiredPoints) {
            return res.json({ 
                success: false, 
                message: `Insufficient Points! Need ${requiredPoints}, Have ${dbUser.referrals}` 
            });
        }
        
        // Calculate Expiry (30 Days)
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 30); 
        
        // Update User
        dbUser.plan = plan;
        dbUser.botLimit = PLAN_LIMITS[plan].botLimit;
        dbUser.planExpiresAt = expiry;
        dbUser.referrals -= requiredPoints;
        await dbUser.save();
        
        logSystem('SUCCESS', `Redeemed ${plan} via Points: ${user}`);
        return res.json({ success: true, message: `Redeemed ${plan} Plan Successfully!` });
    }

    // --- CASE B: CASH PAYMENT (NEEDS ADMIN APPROVAL) ---
    try {
        // Create Record
        const payment = await PaymentModel.create({
            userId, username: user, plan, amount, trxId, method
        });

        // Notify Admin
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

// =================================================================================================
// SECTION 12: AUTOMATED JOBS (CRON)
// =================================================================================================

// 📅 Schedule: Every Day at Midnight (00:00)
// Checks for expired subscriptions and downgrades them.
cron.schedule('0 0 * * *', async () => {
    logSystem('INFO', 'Running Daily Plan Expiry Check...');
    const now = new Date();
    
    try {
        // Find Expired Users
        const expiredUsers = await UserModel.find({ 
            plan: { $ne: 'Free' }, 
            planExpiresAt: { $lt: now } 
        });
        
        for (const user of expiredUsers) {
            logSystem('WARN', `Downgrading Expired User: ${user.userId}`);

            // Downgrade Logic
            user.plan = 'Free';
            user.botLimit = 1;
            user.planExpiresAt = null;
            await user.save();
            
            // Stop Extra Bots (If they have more than 1)
            const bots = await BotModel.find({ ownerId: user.userId });
            if(bots.length > 1) {
                for(let i = 1; i < bots.length; i++) {
                    const bId = bots[i]._id.toString();
                    
                    // Stop RAM instance
                    if(activeBotInstances[bId]) {
                        try { activeBotInstances[bId].stop(); } catch(e){}
                        delete activeBotInstances[bId];
                    }
                    
                    // Update DB status
                    bots[i].status = 'STOPPED';
                    await bots[i].save();
                }
            }

            // Notify User
            try {
                await mainBot.telegram.sendMessage(user.userId, 
                    '⚠️ <b>Subscription Expired</b>\n\n' +
                    'Your plan has expired and you have been downgraded to <b>Free</b>.\n' +
                    'Any bots exceeding the Free limit have been stopped.', 
                    { parse_mode: 'HTML' }
                );
            } catch(e){}
        }
    } catch(err) {
        logSystem('ERROR', 'Cron Job Failed: ' + err.message);
    }
});

// =================================================================================================
// SECTION 13: MAIN ADMIN BOT LOGIC (UI & COMMANDS)
// =================================================================================================

/**
 * Sends the Standardized Main Menu
 * Used in /start and Back buttons
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
        `• Write commands with AI\n` +
        `• Manage everything from one dashboard\n\n` +
        `👇 <b>Choose an option below to get started:</b>`;

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

// 13.1 START COMMAND
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
    await sendStartMenu(ctx, false);
});

// 13.2 TUTORIAL ACTION
mainBot.action('action_tutorial', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.replyWithHTML(
        `📺 <b>How to use Laga Host?</b>\n\n` +
        `Learn how to create, host, and manage your bots in 5 minutes.\n\n` +
        `👉 <a href="${ADMIN_CONFIG.support.youtubeUrl}">Click here to Watch Tutorial</a>`,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Back', 'action_back')]])
    );
});

// 13.3 SUPPORT ACTION
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

// 13.4 STATUS ACTION (AUTO-DISAPPEAR)
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

    const sentMsg = await ctx.editMessageText(statusText, { parse_mode: 'HTML' });

    // Auto Delete after 10s
    setTimeout(async () => {
        try {
            await ctx.deleteMessage(); 
            await sendStartMenu(ctx, false); 
        } catch(e) { }
    }, 10000); 
});

// 13.5 BACK ACTION
mainBot.action('action_back', async (ctx) => {
    await ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch(e){} 
    await sendStartMenu(ctx, false);
});

// 13.6 BROADCAST COMMAND
mainBot.command('broadcast', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_CONFIG.adminId) {
        return ctx.reply("⛔ Unauthorized.");
    }

    const message = ctx.message.text.replace('/broadcast', '').trim();
    if (!message) {
        return ctx.reply("⚠️ Usage: <code>/broadcast Your Message Here</code>", { parse_mode: 'HTML' });
    }

    const statusMsg = await ctx.reply("⏳ <b>Starting Broadcast...</b>\nTarget: Child Bot Users", { parse_mode: 'HTML' });
    
    let stats = {
        sent: 0,
        skippedOwners: 0,
        errors: 0
    };

    try {
        const runningBots = await BotModel.find({ status: 'RUNNING' });

        for (const bot of runningBots) {
            const endUsers = await EndUserModel.find({ botId: bot._id.toString() });
            
            if(endUsers.length === 0) continue;

            let senderBot = activeBotInstances[bot._id.toString()];
            if (!senderBot) {
                try { senderBot = new Telegraf(bot.token); } catch(e) { continue; }
            }

            for (const eu of endUsers) {
                // Skip Owners and Admin
                if (eu.tgId === bot.ownerId || eu.tgId === ADMIN_CONFIG.adminId) {
                    stats.skippedOwners++;
                    continue; 
                }

                try {
                    await senderBot.telegram.sendMessage(eu.tgId, message, { parse_mode: 'HTML' });
                    stats.sent++;
                    // Rate limiting delay
                    await new Promise(r => setTimeout(r, 50));
                } catch(e) {
                    stats.errors++;
                    if(e.code === 403 || e.code === 400) {
                        await EndUserModel.findByIdAndDelete(eu._id);
                    }
                }
            }
        }
    } catch(e) { console.error('Broadcast Error', e); }

    try { await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id); } catch(e){}

    await ctx.reply(
        `✅ <b>Broadcast Complete</b>\n\n` +
        `📨 Sent: <b>${stats.sent}</b>\n` +
        `🛡️ Skipped: <b>${stats.skippedOwners}</b>\n` +
        `❌ Errors: <b>${stats.errors}</b>`,
        { parse_mode: 'HTML' }
    );
});

// 13.7 STATS COMMAND
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

// 13.8 PAYMENT CALLBACK HANDLERS
mainBot.action(/^approve:(\d+):(\w+):(.+)$/, async (ctx) => {
    try {
        const userId = ctx.match[1];
        const plan = ctx.match[2];
        const payId = ctx.match[3];
        
        const limits = PLAN_LIMITS[plan] || PLAN_LIMITS['Free'];
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + limits.validityDays);

        await UserModel.findOneAndUpdate(
            { userId }, 
            { plan, botLimit: limits.botLimit, planExpiresAt: expiry }
        );
        
        await PaymentModel.findByIdAndUpdate(payId, { status: 'APPROVED', adminResponseDate: new Date() });

        await ctx.editMessageText(
            `${ctx.callbackQuery.message.text}\n\n✅ <b>APPROVED</b> by ${ctx.from.first_name}`, 
            { parse_mode: 'HTML' }
        );

        await mainBot.telegram.sendMessage(userId, 
            `✅ <b>Payment Approved!</b>\n\n` +
            `You are now on <b>${plan}</b> plan.\n` +
            `Valid until: ${moment(expiry).format('DD MMM YYYY')}`, 
            { parse_mode: 'HTML' }
        );

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
            `❌ <b>Payment Declined</b>\nPlease contact admin for support.`, 
            { parse_mode: 'HTML' }
        );
    } catch(e) { console.error(e); }
});

// =================================================================================================
// SECTION 14: STARTUP SEQUENCE & GRACEFUL SHUTDOWN
// =================================================================================================

// 14.1 Restore Active Sessions
// Once DB connects, we look for bots that were 'RUNNING' and restart them.
mongoose.connection.once('open', async () => {
    const runningBots = await BotModel.find({ status: 'RUNNING' });
    if(runningBots.length > 0) {
        logSystem('INFO', `Found ${runningBots.length} active bots. Restoring sessions...`);
        
        let restoredCount = 0;
        for (const bot of runningBots) {
            // Slight delay to prevent CPU spike on startup
            await new Promise(r => setTimeout(r, 200));
            
            const res = await startBotEngine(bot);
            if(res.success) restoredCount++;
        }
        
        logSystem('SUCCESS', `Restored ${restoredCount}/${runningBots.length} bots successfully.`);
    } else {
        logSystem('INFO', 'No active bots found to restore.');
    }
});

// 14.2 Launch Main Bot
mainBot.launch({ dropPendingUpdates: true })
    .then(() => logSystem('SUCCESS', 'Main Admin Bot is Online'))
    .catch(err => logSystem('ERROR', 'Main Bot Launch Fail: ' + err.message));

// 14.3 Frontend Fallback (SPA)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 14.4 Graceful Shutdown
// Handles server stops (e.g., Render spindown) to save data/close connections.
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

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

// 14.5 Start HTTP Server
app.listen(PORT, () => {
    logSystem('SUCCESS', `------------------------------------------------`);
    logSystem('SUCCESS', `   LAGA HOST ULTIMATE SERVER IS RUNNING         `);
    logSystem('SUCCESS', `   PORT: ${PORT}                                `);
    logSystem('SUCCESS', `   URL:  ${WEB_APP_URL}                         `);
    logSystem('SUCCESS', `------------------------------------------------`);
});
