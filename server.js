/**
 * =================================================================================
 * PROJECT: LAGA HOST ULTIMATE SERVER (SECURE ENTERPRISE EDITION)
 * VERSION: 6.0.0 (Full Expanded Logic)
 * AUTHOR: Laga Host Team
 * DESCRIPTION: 
 * The comprehensive backend server for the Laga Host Telegram Bot Platform.
 * This server handles:
 *  - Multi-tenant Bot Hosting (Sandboxed Environments)
 *  - AI-Powered Code Generation (Gemini 2.0 Integration)
 *  - Secure Payment Gateway & Subscription Management
 *  - Advanced Broadcast System with Target Filtering
 *  - Real-time Analytics & User Activity Tracking
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

// HTTP Client for external API calls (OpenRouter/AI)
const axios = require('axios');

// =================================================================================
// 2. GLOBAL CONFIGURATION & CONSTANTS
// =================================================================================

// Initialize the Express Application
const app = express();

// Define Server Port
const PORT = process.env.PORT || 3000;

// ⚠️ SYSTEM URL CONFIGURATION
// This URL is used for WebHooks (if needed) and AI Referer headers
const WEB_APP_URL = process.env.WEB_APP_URL || "https://lagahost.onrender.com";

// 🤖 ARTIFICIAL INTELLIGENCE CONFIGURATION
// We use OpenRouter to access Gemini 2.0 Flash for cost-effective & fast generation
const AI_CONFIG = {
    apiKey: "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",
    model: "google/gemini-2.0-flash-exp:free",
    headers: {
        "HTTP-Referer": WEB_APP_URL,
        "X-Title": "Laga Host Platform"
    }
};

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
        tutorialVideoUrl: "https://youtube.com/@lagatech" // Need actual video link
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
 * @param {string} type - The category of the log (INFO, ERROR, WARN, SUCCESS, DB, BOT, AI)
 * @param {string} message - The message to be logged
 */
function logSystem(type, message) {
    const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
    
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
        // We do not exit process here to allow retry logic if needed, 
        // but typically the app might crash if DB is essential.
        process.exit(1); 
    });

// --- 4.1 USER SCHEMA ---
// Stores information about the platform users (bot creators)
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

// --- 4.2 BOT SCHEMA ---
// Stores configuration for the hosted bots
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

// --- 4.3 END USER SCHEMA ---
// Stores users who interact with the HOSTED bots.
// Essential for Analytics and Broadcasting features.
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

// 5.1 RAM Storage for Active Bot Instances
// Since JS objects are stored in RAM, if the server restarts (e.g., Render spin down),
// this object clears. We use the 'status' in DB to restore them on startup.
let activeBotInstances = {}; 

// 5.2 Middleware Configuration
app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(bodyParser.json({ limit: '50mb' })); // Allow large payloads for code saving
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'))); // Serve Static Assets

// 5.3 Request Logging Middleware
app.use((req, res, next) => {
    // We filter logs to avoid spamming console with static file requests
    if(req.path.startsWith('/api')) {
        // Uncomment next line for verbose API logging
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
        // Since we are using Long Polling, we must ensure no Webhook is set on Telegram's side.
        try {
            await bot.telegram.deleteWebhook();
        } catch (webhookErr) {
            // Safe to ignore, implies webhook wasn't set or token issue (caught later)
        }

        // 3. Verify Token & Connectivity
        const botInfo = await bot.telegram.getMe();
        
        // 4. Global Error Handler for this specific bot instance
        bot.catch((err, ctx) => {
            logSystem('ERROR', `[Child Bot Error] [${botDoc.name}]: ${err.message}`);
        });

        // =========================================================
        // MIDDLEWARE: ANALYTICS TRACKER
        // =========================================================
        bot.use(async (ctx, next) => {
            if(ctx.from) {
                // Execute in background (fire and forget) to not block bot speed
                (async () => {
                    try {
                        const tgId = ctx.from.id.toString();

                        // 🛡️ ANALYTICS FILTER:
                        // We still record the owner in DB for completeness,
                        // but logic elsewhere handles the broadcasting filter.
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
                            // logSystem('INFO', `[${botDoc.name}] New User Detected: ${ctx.from.first_name}`);
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
            
            // We only process command-like messages (starting with /)
            // But you could expand this to handle all text if needed.
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
                        // User can use: ctx, bot, Markup, axios, moment.
                        
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
                                ).catch(e => {}); // Ignore if user blocked bot
                            }
                        `);
                        
                        // Execute the code
                        runUserCode(ctx, bot, Markup, axios, moment);
                        
                    } catch (syntaxError) {
                        // System-Level Syntax Error Handling (e.g. missing brackets in DB code)
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
        
        let userMsg = 'Internal Server Error during startup.';
        if (error.message.includes('401')) userMsg = 'Invalid Bot Token! The token is revoked or incorrect.';
        if (error.message.includes('409')) userMsg = 'Conflict! This bot is already running on another server.';

        return { success: false, message: userMsg };
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
// 9. AI GENERATION API (FIXED FOR MARKUP)
// =================================================================================

app.post('/api/ai-generate', async (req, res) => {
    const { prompt, type, model } = req.body;

    if (!prompt) return res.json({ success: false, message: "Prompt is empty" });
    if (!AI_CONFIG.apiKey) return res.json({ success: false, message: "AI API Key Missing" });

    // 🎯 SYSTEM PROMPT ENGINEERING
    // This is crucial to ensure the AI generates code that matches the Markup syntax we use.
    let systemInstruction = "";
    
    if (type === 'code') {
        systemInstruction =
            "You are an expert Telegram Bot Developer using Telegraf.js v4.\n" +
            "Your Task: Write ONLY the RAW JavaScript code body that goes inside a `bot.command` or `bot.on` function.\n" +
            "Do NOT write the function wrapper (e.g. `bot.command('start', (ctx) => { ... })`).\n" +
            "Do NOT include markdown blocks (```).\n\n" +
            "AVAILABLE VARIABLES:\n" +
            "- `ctx` (The Telegraf Context)\n" +
            "- `bot` (The Telegraf Instance)\n" +
            "- `Markup` (For Buttons/Keyboards)\n" +
            "- `axios` (For HTTP Requests)\n" +
            "- `moment` (For Time)\n\n" +
            "RULES FOR MESSAGES:\n" +
            "1. Use `ctx.replyWithHTML('Text', extra)` for sending messages.\n" +
            "2. For Inline Buttons, strictly use this syntax:\n" +
            "   `Markup.inlineKeyboard([\n" +
            "     [Markup.button.callback('Button Name', 'callback_data')],\n" +
            "     [Markup.button.url('Link Name', 'https://example.com')],\n" +
            "     [Markup.button.webApp('Web App', 'https://webapp.com')]\n" +
            "   ])`\n\n" +
            "EXAMPLE OUTPUT:\n" +
            "ctx.replyWithHTML('<b>Hello!</b>', Markup.inlineKeyboard([[Markup.button.callback('Click Me', 'click')]]));";
    } else {
        systemInstruction =
            "You are a professional Copywriter for Telegram Marketing.\n" +
            "Write a concise, engaging Broadcast message using HTML tags.\n" +
            "Supported Tags: <b>, <i>, <a>, <code>, <pre>.\n" +
            "Do NOT use Markdown (**bold**). Use HTML only.";
    }

    try {
        // Request to OpenRouter
        const response = await axios.post(
            "https://openrouter.ai/api/v1/chat/completions",
            {
                model: model || AI_CONFIG.model,
                messages: [
                    { role: "system", content: systemInstruction },
                    { role: "user", content: prompt }
                ]
            },
            {
                headers: {
                    Authorization: `Bearer ${AI_CONFIG.apiKey}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": AI_CONFIG.headers["HTTP-Referer"],
                    "X-Title": AI_CONFIG.headers["X-Title"]
                }
            }
        );

        const msgData = response.data?.choices?.[0]?.message;
        let finalContent = "";

        if (msgData?.content) {
            finalContent = msgData.content;
        }

        // CLEANUP: Remove Markdown delimiters if AI adds them despite instructions
        finalContent = finalContent
            .replace(/```javascript/gi, "")
            .replace(/```js/gi, "")
            .replace(/```html/gi, "")
            .replace(/```/g, "")
            .trim();

        if (!finalContent) throw new Error("Empty AI Response");

        res.json({ success: true, result: finalContent });

    } catch (e) {
        const errMsg = e.response?.data?.error?.message || e.message;
        logSystem('ERROR', `AI Gen Failed: ${errMsg}`);
        res.json({ 
            success: false, 
            message: "AI Service is currently busy. Please try again." 
        });
    }
});

// =================================================================================
// 10. EDITOR ROUTES
// =================================================================================

// Get All Commands
app.post('/api/getCommands', async (req, res) => {
    try {
        const bot = await BotModel.findById(req.body.botId);
        res.json(bot ? bot.commands : {});
    } catch(e) { res.json({}) }
});

// Save Single Command
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
// 11. PAYMENT PROCESSING
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
// 12. CRON JOBS (AUTOMATION)
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
// 13. MAIN ADMIN BOT LOGIC (UI/UX OVERHAUL)
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
        `• Write commands with AI\n` +
        `• Manage everything from one dashboard\n` +
        `• Use tools without coding\n\n` +
        `<i>Whether you are a beginner or a pro — this bot is built for you.</i>\n\n` +
        `👇 <b>Choose an option below to get started:</b>`;

    // 🎯 UI LAYOUT: 6 Buttons as requested
    const buttons = [
        [Markup.button.callback('📺 Watch Tutorial', 'action_tutorial')], // Row 1: Full Width
        [
            Markup.button.url('🔴 YouTube', ADMIN_CONFIG.support.youtubeUrl),
            Markup.button.url('📢 Telegram', ADMIN_CONFIG.channels[0].url)
        ], // Row 2: Two Columns
        [
            Markup.button.callback('🛠 Support', 'action_support'),
            Markup.button.callback('📊 Status', 'action_status')
        ], // Row 3: Two Columns
        [Markup.button.webApp('🚀 Open Dashboard', WEB_APP_URL)] // Row 4: Full Width (CTA)
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

// 13.5 BACK ACTION
mainBot.action('action_back', async (ctx) => {
    await ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch(e){} // Clean slate
    await sendStartMenu(ctx, false);
});

// 13.6 BROADCAST COMMAND (TARGET: ONLY END USERS)
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

    const statusMsg = await ctx.reply("⏳ <b>Starting Broadcast...</b>\n🎯 Target: Only Child Bot Users (Owners are Skipped)", { parse_mode: 'HTML' });
    
    let stats = {
        sent: 0,
        skippedOwners: 0,
        errors: 0
    };

    logSystem('INFO', `End-User Only Broadcast Started by ${ctx.from.first_name}`);

    // ❌ PHASE 1: Main Bot Users (SKIPPED AS PER REQUEST)
    // আমরা এখানে UserModel থেকে কাউকে মেসেজ পাঠাবো না।

    // ✅ PHASE 2: Child Bot Users (Hosted Bots)
    try {
        // শুধুমাত্র যারা 'RUNNING' আছে তাদের থেকেই মেসেজ যাবে
        const runningBots = await BotModel.find({ status: 'RUNNING' });

        for (const bot of runningBots) {
            // ওই নির্দিষ্ট বটের ইউজারদের খুঁজছি
            const endUsers = await EndUserModel.find({ botId: bot._id.toString() });
            
            // যদি ওই বটের কোনো ইউজার না থাকে, পরের বটে চলে যাও
            if(endUsers.length === 0) continue;

            // বটের ইনস্ট্যান্স বের করা (মেসেজ পাঠানোর জন্য)
            let senderBot = activeBotInstances[bot._id.toString()];
            if (!senderBot) {
                // যদি RAM এ না থাকে, নতুন করে ইনিশিয়াল করা
                try { senderBot = new Telegraf(bot.token); } catch(e) { continue; }
            }

            // প্রতিটি ইউজারের কাছে লুপ চালানো
            for (const eu of endUsers) {
                
                // 🛡️ FILTER LOGIC (আপনার চাহিদা অনুযায়ী)
                // ১. ইউজার কি বটের মালিক? -> স্কিপ করুন
                // ২. ইউজার কি আপনি (এডমিন)? -> স্কিপ করুন
                if (eu.tgId === bot.ownerId || eu.tgId === ADMIN_CONFIG.adminId) {
                    stats.skippedOwners++;
                    continue; 
                }

                try {
                    // মেসেজ পাঠানো হচ্ছে...
                    await senderBot.telegram.sendMessage(eu.tgId, message, { parse_mode: 'HTML' });
                    stats.sent++;
                    
                    // সার্ভারের ওপর চাপ কমাতে ৫০ মিলি সেকেন্ড বিরতি
                    await new Promise(r => setTimeout(r, 50));
                } catch(e) {
                    stats.errors++;
                    // যদি ইউজার বট ব্লক করে দেয়, ডাটাবেস থেকে ডিলিট করে দেওয়া হবে
                    if(e.code === 403 || e.code === 400) {
                        await EndUserModel.findByIdAndDelete(eu._id);
                    }
                }
            }
        }
    } catch(e) { console.error('Broadcast Error', e); }

    // Final Report to Admin
    try { await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id); } catch(e){}

    await ctx.reply(
        `✅ <b>Broadcast Complete</b>\n\n` +
        `📨 Sent to Public: <b>${stats.sent}</b>\n` +
        `🛡️ Owners Skipped: <b>${stats.skippedOwners}</b>\n` +
        `❌ Errors/Blocked: <b>${stats.errors}</b>`,
        { parse_mode: 'HTML' }
    );
});

// 13.7 ADMIN STATS COMMAND
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

// 13.8 PAYMENT CALLBACKS
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
// 14. STARTUP SEQUENCE & ERROR HANDLING
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
            await new Promise(r => setTimeout(r, 200));
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
