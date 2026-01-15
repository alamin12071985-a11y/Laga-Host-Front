/**
 * =================================================================================
 * PROJECT: LAGA HOST ULTIMATE SERVER (SECURE ENTERPRISE EDITION)
 * VERSION: 7.0.0 (Custom Broadcast & Frontend AI Architecture)
 * AUTHOR: Laga Host Team
 * DESCRIPTION: 
 * The comprehensive backend server for the Laga Host Telegram Bot Platform.
 * This server handles:
 *  - Multi-tenant Bot Hosting (Sandboxed Environments)
 *  - Secure Payment Gateway & Subscription Management
 *  - DUAL CHANNEL Broadcast System (Main Users vs Client End-Users)
 *  - Real-time Analytics & User Activity Tracking
 *  - Dynamic Command Execution Engine
 * =================================================================================
 */

// =================================================================================
// 1. SYSTEM DEPENDENCIES & IMPORTS
// =================================================================================

// Load environment variables from .env file
require('dotenv').config();

// Express Framework for handling HTTP/API Requests
const express = require('express');

// Telegraf Framework for Telegram Bot Interaction
const { Telegraf, Markup, session } = require('telegraf');

// Middleware for parsing request bodies (JSON/URL-encoded)
const bodyParser = require('body-parser');

// CORS Middleware to allow cross-origin requests from frontend
const cors = require('cors');

// Node.js Built-in Utilities
const path = require('path');
const fs = require('fs');

// Database Driver (MongoDB)
const mongoose = require('mongoose');

// Task Scheduler for automated jobs (CRON)
const cron = require('node-cron');

// Date & Time Formatting Library
const moment = require('moment');

// HTTP Client for external API calls (if needed for other tools)
const axios = require('axios');

// =================================================================================
// 2. GLOBAL CONFIGURATION & CONSTANTS
// =================================================================================

// Initialize the Express Application
const app = express();

// Define Server Port
const PORT = process.env.PORT || 3000;

// ⚠️ SYSTEM URL CONFIGURATION
const WEB_APP_URL = process.env.WEB_APP_URL || "https://lagahost.onrender.com";

// 🛠️ ADMIN & PLATFORM SETTINGS
const ADMIN_CONFIG = {
    // The Main Host Bot Token
    token: process.env.BOT_TOKEN || "8264143788:AAH0fRkMqBw4rONo0WVEi-OyAVkPs9bRt84",
    
    // The Super Admin's Telegram ID (Required for Alerts & Payments)
    adminId: process.env.ADMIN_ID || "7605281774",
    
    // Mandatory Channels to Join
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

    // Support Resources
    support: {
        adminUser: "@lagatech",
        channelUrl: "https://t.me/lagatech",
        youtubeUrl: "https://youtube.com/@lagatech?si=LC_FiXS4BdwR11XR",
        tutorialVideoUrl: "https://youtube.com/@lagatech"
    },

    // Payment Methods Display Info
    payment: {
        nagad: "01761494948",
        bkash: "01761494948"
    }
};

// 📊 PLAN LIMITS & CONFIGURATION
const PLAN_LIMITS = {
    'Free': { botLimit: 1, validityDays: 9999 }, // Lifetime
    'Pro':  { botLimit: 5, validityDays: 30, pricePoints: 50 },
    'VIP':  { botLimit: 10, validityDays: 30, pricePoints: 80 }
};

// 🗄️ DATABASE CONNECTION STRING
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://lagahost:l%40g%40ho%24t@snowmanadventure.ocodku0.mongodb.net/snowmanadventure?retryWrites=true&w=majority&appName=snowmanadventure";

// =================================================================================
// 3. ENHANCED LOGGING SYSTEM
// =================================================================================

/**
 * Logs system events to the console with timestamp and category icons.
 * This helps in debugging issues in production environments like Render.
 * 
 * @param {string} type - The category of the log (INFO, ERROR, WARN, SUCCESS, DB, BOT, BROADCAST)
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
        SEC:       '🛡️  [SECURE] '
    };
    
    const prefix = icons[type] || '🔹  [LOG]    ';
    console.log(`${prefix} [${timestamp}] : ${message}`);
}

// =================================================================================
// 4. DATABASE MODELS & SCHEMAS (EXPANDED)
// =================================================================================

// Establish Database Connection
mongoose.connect(MONGO_URI)
    .then(() => {
        logSystem('DB', '----------------------------------------');
        logSystem('DB', 'MongoDB Database Connected Successfully');
        logSystem('DB', 'Connection State: ESTABLISHED');
        logSystem('DB', '----------------------------------------');
    })
    .catch(err => {
        logSystem('ERROR', 'CRITICAL DATABASE CONNECTION FAILURE');
        logSystem('ERROR', err.message);
        // We do not exit process here to allow retry logic if needed
    });

// --- 4.1 USER SCHEMA (Main Platform Users) ---
// Stores information about the people using Laga Host to create bots
const userSchema = new mongoose.Schema({
    userId: { 
        type: String, 
        required: true, 
        unique: true, 
        index: true 
    },
    username: { type: String, default: 'Unknown' },
    firstName: { type: String, default: 'User' },
    
    // Plan & Subscription
    plan: { 
        type: String, 
        default: 'Free', 
        enum: ['Free', 'Pro', 'VIP'] 
    },
    planExpiresAt: { type: Date, default: null },
    
    // Usage Limits
    botLimit: { type: Number, default: 1 },
    
    // Referral System
    referrals: { type: Number, default: 0 },
    referredBy: { type: String, default: null },
    
    // Payment History
    totalPaid: { type: Number, default: 0 },
    
    // Account Status
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
    
    // Bot Status
    status: { 
        type: String, 
        default: 'STOPPED', 
        enum: ['RUNNING', 'STOPPED', 'ERROR', 'BANNED'] 
    },
    
    // Code Storage (The "Brain")
    // commands object maps command names (e.g., 'start') to JS code strings
    commands: { type: Object, default: {} }, 
    
    // Environment Variables (Future Proofing)
    envVars: { type: Object, default: {} },
    
    // Statistics
    startedAt: { type: Date, default: null },
    restartCount: { type: Number, default: 0 },
    
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
    createdAt: { type: Date, default: Date.now }
});
// Compound index: A user is unique per bot
endUserSchema.index({ tgId: 1, botId: 1 }, { unique: true });

// --- 4.4 PAYMENT SCHEMA ---
// Keeps a record of all transactions
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
let activeBotInstances = {}; 

// Temporary storage for Broadcast messages (Admin ID -> Message)
let pendingBroadcasts = {};

// 5.2 Middleware Configuration
app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(bodyParser.json({ limit: '50mb' })); // Allow large payloads for code saving
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'))); // Serve Static Assets

// 5.3 Request Logging Middleware
app.use((req, res, next) => {
    // Filter logs to avoid spamming console with static file requests
    if(req.path.startsWith('/api')) {
        // logSystem('INFO', `API Request: ${req.method} ${req.path} from ${req.ip}`);
    }
    next();
});

// 5.4 Initialize Main Admin Bot
const mainBot = new Telegraf(ADMIN_CONFIG.token);

// =================================================================================
// 6. HELPER FUNCTIONS
// =================================================================================

/**
 * Validates a Telegram Bot Token format using Regex
 * @param {string} token 
 * @returns {boolean}
 */
function isValidBotToken(token) {
    return /^\d+:[A-Za-z0-9_-]{35,}$/.test(token);
}

/**
 * Formats a Date object to a readable string
 * @param {Date} date 
 * @returns {string}
 */
function formatDate(date) {
    if(!date) return 'Never';
    return moment(date).format('DD MMM YYYY, h:mm A');
}

/**
 * Checks if a user has reached their bot limit
 * @param {string} userId 
 * @returns {Promise<boolean>}
 */
async function hasReachedLimit(userId) {
    const user = await UserModel.findOne({ userId });
    if (!user) return true; // Fail safe
    
    const count = await BotModel.countDocuments({ ownerId: userId });
    return count >= user.botLimit;
}

/**
 * Sleep function for rate limiting
 * @param {number} ms 
 * @returns {Promise}
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// =================================================================================
// 7. BOT HOSTING ENGINE (THE CORE LOGIC)
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
        logSystem('BOT', `Initializing Bot Engine for: ${botDoc.name}`);

        // 2. Initialize Telegraf Instance
        const bot = new Telegraf(botDoc.token);

        // 🛑 CRITICAL: Remove Webhook
        try {
            await bot.telegram.deleteWebhook();
        } catch (webhookErr) {
            // Safe to ignore
        }

        // 3. Verify Token & Connectivity
        const botInfo = await bot.telegram.getMe();
        
        // 4. Global Error Handler for this specific bot instance
        bot.catch((err, ctx) => {
            logSystem('ERROR', `[Child Bot Error] [${botDoc.name}]: ${err.message}`);
        });

        // =========================================================
        // MIDDLEWARE: ANALYTICS TRACKER (End Users)
        // =========================================================
        bot.use(async (ctx, next) => {
            if(ctx.from) {
                // Execute in background
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
                const cmdName = text.substring(1).split(' ')[0]; // Extract 'start' from '/start'
                
                // Fetch fresh code from DB (Allows Hot-Reloading without restart)
                const freshBot = await BotModel.findById(botId);
                const code = freshBot?.commands?.[cmdName];
                
                if (code) {
                    try {
                        // 🔒 CREATING THE SANDBOX
                        // We create a new Function that wraps the user's code.
                        // We strictly pass only necessary variables to prevent system access.
                        
                        const runUserCode = new Function('ctx', 'bot', 'Markup', 'axios', 'moment', `
                            try {
                                // --- BEGIN USER CODE ---
                                ${code}
                                // --- END USER CODE ---
                            } catch(runtimeError) {
                                // User-Level Runtime Error Handling
                                ctx.replyWithHTML(
                                    '⚠️ <b>Bot Execution Error:</b>\\n' + 
                                    '<pre>' + runtimeError.message + '</pre>'
                                ).catch(e => {});
                            }
                        `);
                        
                        // Execute the code
                        runUserCode(ctx, bot, Markup, axios, moment);
                        
                    } catch (syntaxError) {
                        // System-Level Syntax Error Handling
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
// 8. API ROUTE HANDLERS
// =================================================================================

// 8.1 GET BOTS (SYNC USER)
app.post('/api/bots', async (req, res) => {
    try {
        const { userId, username, firstName } = req.body;
        
        if(!userId) {
            return res.status(400).json({ error: "Invalid Request: User ID Missing" });
        }

        // Find or Create User
        let user = await UserModel.findOne({ userId });
        
        if (!user) {
            user = await UserModel.create({ userId, username, firstName });
            logSystem('INFO', `New Platform User Registered: ${firstName} (${userId})`);
        } else {
            // Update Activity
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
        logSystem('ERROR', `/api/bots: ${e.message}`);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// 8.2 CREATE BOT (WITH VALIDATION)
app.post('/api/createBot', async (req, res) => {
    try {
        const { token, name, userId } = req.body;
        
        // Step 1: Check Limits
        const user = await UserModel.findOne({ userId });
        const currentCount = await BotModel.countDocuments({ ownerId: userId });
        
        if (currentCount >= user.botLimit) {
            return res.json({ 
                success: false, 
                message: `⚠️ Plan Limit Reached (${user.botLimit})! Please Upgrade to Pro or VIP.` 
            });
        }
        
        // Step 2: Validate Token Format
        if(!isValidBotToken(token)) {
            return res.json({ success: false, message: '❌ Invalid Bot Token Format. Please copy correctly from @BotFather.' });
        }

        // Step 3: Check Duplicates
        const existing = await BotModel.findOne({ token });
        if (existing) {
            return res.json({ success: false, message: '❌ This bot token is already registered on our platform!' });
        }

        // Step 4: Create
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

// 8.3 TOGGLE BOT (START/STOP)
app.post('/api/toggleBot', async (req, res) => {
    try {
        const { botId, action } = req.body;
        const bot = await BotModel.findById(botId);
        
        if(!bot) return res.json({ success: false, message: 'Bot not found in database' });

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

// 8.4 RESTART BOT (HARD RESET)
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

// 8.5 DELETE BOT (CLEANUP)
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

// Save Single Command (Generated from Frontend AI)
app.post('/api/saveCommand', async (req, res) => {
    try {
        const { botId, command, code } = req.body;
        // Sanitize command name (remove / and spaces)
        const cleanCmd = command.replace('/', '').replace(/\s/g, '_');
        
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
        await BotModel.findByIdAndUpdate(botId, { 
            $unset: { [`commands.${command}`]: "" } 
        });
        res.json({ success: true });
    } catch(e) { res.json({ success: false }) }
});

// =================================================================================
// 10. PAYMENT PROCESSING
// =================================================================================

app.post('/api/submit-payment', async (req, res) => {
    const { trxId, plan, amount, userId, user, method } = req.body;

    logSystem('INFO', `Payment Request: ${user} - ${amount} via ${method}`);

    // --- CASE A: REFERRAL REDEMPTION ---
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
        
        // Calculate Expiry
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 30); // 30 Days
        
        // Apply Upgrade
        dbUser.plan = plan;
        dbUser.botLimit = PLAN_LIMITS[plan].botLimit;
        dbUser.planExpiresAt = expiry;
        dbUser.referrals -= requiredPoints;
        await dbUser.save();
        
        logSystem('SUCCESS', `User ${user} redeemed ${plan} via Points`);
        return res.json({ success: true, message: `Redeemed ${plan} Plan Successfully!` });
    }

    // --- CASE B: CASH PAYMENT (MANUAL REVIEW) ---
    try {
        // Create Payment Record
        const payment = await PaymentModel.create({
            userId, username: user, plan, amount, trxId, method
        });

        // Notify Admin via Telegram
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
// 11. CRON JOBS (AUTOMATION)
// =================================================================================

// 📅 Schedule: Every Day at Midnight (00:00)
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
            
            // Stop Extra Bots
            const bots = await BotModel.find({ ownerId: user.userId });
            if(bots.length > 1) {
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

// =================================================================================
// 12. MAIN ADMIN BOT LOGIC (UI/UX OVERHAUL)
// =================================================================================

/**
 * Helper: Sends the Standardized Main Menu
 * Used in /start and Back buttons
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
        `• Write commands with AI (Frontend)\n` +
        `• Manage everything from one dashboard\n` +
        `• Use tools without coding\n\n` +
        `<i>Whether you are a beginner or a pro — this bot is built for you.</i>\n\n` +
        `👇 <b>Choose an option below to get started:</b>`;

    // 🎯 UI LAYOUT: 6 Buttons as requested
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

// 14.2 PAYMENT CALLBACKS
mainBot.action(/^approve:(\d+):(\w+):(.+)$/, async (ctx) => {
    try {
        const userId = ctx.match[1];
        const plan = ctx.match[2];
        const payId = ctx.match[3];
        
        // Limits
        const limits = PLAN_LIMITS[plan] || PLAN_LIMITS['Free'];
        
        // Expiry
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + limits.validityDays);

        // DB Update
        await UserModel.findOneAndUpdate(
            { userId }, 
            { plan, botLimit: limits.botLimit, planExpiresAt: expiry }
        );
        
        await PaymentModel.findByIdAndUpdate(payId, { status: 'APPROVED', adminResponseDate: new Date() });

        // Admin Notification
        await ctx.editMessageText(
            `${ctx.callbackQuery.message.text}\n\n✅ <b>APPROVED</b> by ${ctx.from.first_name}`, 
            { parse_mode: 'HTML' }
        );

        // User Notification
        await mainBot.telegram.sendMessage(userId, 
            `✅ <b>Payment Approved!</b>\n\n` +
            `You have been upgraded to <b>${plan}</b> plan.\n` +
            `Bot Limit: ${limits.botLimit}\n` +
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
            `❌ <b>Payment Declined</b>\n\n` +
            `Your transaction details could not be verified or amount was incorrect.\n` +
            `Please contact admin for support.`, 
            { parse_mode: 'HTML' }
        );
    } catch(e) { console.error(e); }
});

// =================================================================================
// 15. STARTUP SEQUENCE & ERROR HANDLING
// =================================================================================

/**
 * STARTUP SEQUENCE
 * 1. Connect DB (Done above)
 * 2. Restore Sessions
 * 3. Start Main Bot
 * 4. Start HTTP Server
 */

// A. Restore Active Bot Sessions
mongoose.connection.once('open', async () => {
    const runningBots = await BotModel.find({ status: 'RUNNING' });
    if(runningBots.length > 0) {
        logSystem('INFO', `Found ${runningBots.length} bots to restore...`);
        
        let restoredCount = 0;
        for (const bot of runningBots) {
            // Slight delay to prevent CPU spike
            await sleep(200);
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

// C. Serve Frontend (SPA Fallback)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// D. Graceful Shutdown Handling
const shutdown = (signal) => {
    logSystem('WARN', `${signal} received. Shutting down securely...`);
    mainBot.stop(signal);
    Object.values(activeBotInstances).forEach(bot => {
        try { bot.stop(signal); } catch(e) {}
    });
    mongoose.connection.close(false, () => {
        logSystem('DB', 'Database connection closed.');
        process.exit(0);
    });
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

// E. Start Express Server
app.listen(PORT, () => {
    logSystem('SUCCESS', `-------------------------------------------`);
    logSystem('SUCCESS', `LAGA HOST SERVER RUNNING ON PORT ${PORT}`);
    logSystem('SUCCESS', `DASHBOARD URL: ${WEB_APP_URL}`);
    logSystem('SUCCESS', `-------------------------------------------`);
});
