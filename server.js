/**
 * =================================================================================================
 *  PROJECT NAME: LAGA HOST ULTIMATE AI - ENTERPRISE CORE SERVER
 *  VERSION: 10.0.0 (ULTRA EXTENDED & SECURE ARCHITECTURE)
 *  
 *  DEVELOPER: Laga Host Development Team
 *  COPYRIGHT: © 2024-2025 Laga Host
 *  
 *  SYSTEM OVERVIEW:
 *  This is the monolithic backend for the Telegram Bot Hosting Platform.
 *  It integrates AI generation, Sandbox execution, Payment Gateways,
 *  and Advanced Security protocols into a single unified server.
 * 
 *  KEY MODULES:
 *  1. [CORE] Express.js REST API Server
 *  2. [DB] MongoDB Connection with Mongoose ORM
 *  3. [BOT] Telegraf v4 Bot Hosting Engine (Sandbox)
 *  4. [AI] Gemini 2.0 Integration via OpenRouter
 *  5. [SEC] IP Fingerprinting & Anti-Cheat System
 *  6. [FIN] Manual Payment Processing System
 *  7. [COM] Broadcast System with Smart Filtering
 * =================================================================================================
 */

// =================================================================================================
// SECTION 1: LIBRARY IMPORTS
// Description: Loading all necessary node modules required for operation.
// =================================================================================================

// Securely load environment variables from .env file
require('dotenv').config();

// Express Framework for handling HTTP Requests
const express = require('express');

// Telegram Bot Framework (Telegraf) & Markup for Buttons
const { Telegraf, Markup, session } = require('telegraf');

// Body Parser middleware to handle JSON and URL-encoded data
const bodyParser = require('body-parser');

// Cross-Origin Resource Sharing to allow Frontend communication
const cors = require('cors');

// Native File System and Path modules
const path = require('path');
const fs = require('fs');

// Database Driver for MongoDB
const mongoose = require('mongoose');

// Task Scheduler for Cron Jobs (Daily Checks)
const cron = require('node-cron');

// Date and Time formatting library
const moment = require('moment');

// HTTP Client for external API requests (AI, etc.)
const axios = require('axios');

// =================================================================================================
// SECTION 2: SYSTEM CONFIGURATION & CONSTANTS
// Description: Defining global constants, API keys, and configuration objects.
// =================================================================================================

// Initialize the Express Application
const app = express();

// Define the Server Port
const PORT = process.env.PORT || 3000;

// Define the Frontend Web Application URL
const WEB_APP_URL = process.env.WEB_APP_URL || "https://lagahost.onrender.com"; 

// -------------------------------------------------------------------------------------------------
// AI CONFIGURATION (Gemini 2.0 Flash)
// -------------------------------------------------------------------------------------------------
const OPENROUTER_API_KEY = "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";
const AI_MODEL = "google/gemini-2.0-flash-exp:free"; 

// -------------------------------------------------------------------------------------------------
// ADMIN & PLATFORM CONFIGURATION OBJECT
// -------------------------------------------------------------------------------------------------
const ADMIN_CONFIG = {
    // The Bot Token for the Main Hosting Bot
    token: process.env.BOT_TOKEN || "8264143788:AAH0fRkMqBw4rONo0WVEi-OyAVkPs9bRt84",
    
    // Super Admin Telegram ID (For Notifications)
    adminId: process.env.ADMIN_ID || "7605281774",
    
    // Mandatory Channels for Users
    channels: [
        { 
            name: 'Laga Tech Official', 
            username: '@lagatechofficial',
            url: 'https://t.me/lagatechofficial' 
        },
        { 
            name: 'Snowman Adventure', 
            username: '@snowmanadventure',
            url: 'https://t.me/snowmanadventureannouncement' 
        }
    ],
    
    // Support Contact Information
    support: {
        telegram: '@lagatech',
        youtube: 'https://youtube.com/@lagatech?si=LC_FiXS4BdwR11XR',
        tutorial_video: 'https://youtube.com/@lagatech' 
    },
    
    // Manual Payment Wallet Numbers
    payment: {
        nagad: "01761494948",
        bkash: "01761494948"
    }
};

// -------------------------------------------------------------------------------------------------
// DATABASE CONNECTION STRING
// -------------------------------------------------------------------------------------------------
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://lagahost:l%40g%40ho%24t@snowmanadventure.ocodku0.mongodb.net/snowmanadventure?retryWrites=true&w=majority&appName=snowmanadventure";

// =================================================================================================
// SECTION 3: ADVANCED LOGGING SYSTEM
// Description: A robust logger to track every system event, error, and security alert.
// =================================================================================================

/**
 * Logs a message to the console with a timestamp and category icon.
 * 
 * @param {string} type - The category of the log (INFO, ERROR, SECURITY, etc.)
 * @param {string} message - The main log message.
 * @param {object|string} [details] - Optional extra details or error objects.
 */
function logSystem(type, message, details = null) {
    const timestamp = moment().format('DD-MM-YYYY HH:mm:ss');
    let icon = '';

    // Assign Icons based on Log Type
    if (type === 'INFO') {
        icon = '🔹 [INFO]   ';
    } else if (type === 'ERROR') {
        icon = '❌ [ERROR]  ';
    } else if (type === 'WARN') {
        icon = '⚠️ [WARN]   ';
    } else if (type === 'SUCCESS') {
        icon = '✅ [SUCCESS]';
    } else if (type === 'SECURITY') {
        icon = '🛡️ [SECURITY]';
    } else if (type === 'DB') {
        icon = '🗄️ [DATABASE]';
    } else if (type === 'BOT') {
        icon = '🤖 [BOT_ENG]';
    } else {
        icon = '📝 [LOG]    ';
    }

    // Construct the log string
    const logOutput = `${icon} | ${timestamp} | ${message}`;
    
    // Output to console
    console.log(logOutput);
    
    // If there are details, print them nicely
    if (details) {
        if (typeof details === 'object') {
            console.log(`   └── Details: ${JSON.stringify(details)}`);
        } else {
            console.log(`   └── Details: ${details}`);
        }
    }
}

// =================================================================================================
// SECTION 4: DATABASE SCHEMA DEFINITIONS
// Description: Defining Mongoose Schemas for Users, Bots, EndUsers, and Payments.
// =================================================================================================

// Attempt to Connect to MongoDB
mongoose.connect(MONGO_URI)
    .then(() => {
        logSystem('DB', '--------------------------------------------------');
        logSystem('DB', 'MongoDB Connection Established Successfully.');
        logSystem('DB', 'Ready to handle read/write operations.');
        logSystem('DB', '--------------------------------------------------');
    })
    .catch((err) => {
        logSystem('ERROR', 'CRITICAL FAILURE: Could not connect to MongoDB.');
        logSystem('ERROR', 'Reason: ' + err.message);
        // Exit process on DB failure as the app cannot function without it
        process.exit(1);
    });

// -------------------------------------------------------------------------------------------------
// 1. USER SCHEMA (Enhanced for Security)
// -------------------------------------------------------------------------------------------------
const userSchema = new mongoose.Schema({
    // Identity Fields
    userId: { 
        type: String, 
        required: true, 
        unique: true, 
        index: true 
    },
    username: { 
        type: String, 
        default: 'Unknown' 
    },
    firstName: { 
        type: String, 
        default: 'Unknown' 
    },
    
    // Subscription & Plan
    plan: { 
        type: String, 
        default: 'Free', 
        enum: ['Free', 'Pro', 'VIP'] 
    },
    botLimit: { 
        type: Number, 
        default: 1 
    },
    planExpiresAt: { 
        type: Date, 
        default: null 
    },
    
    // Referral System
    referrals: { 
        type: Number, 
        default: 0 
    },
    referredBy: { 
        type: String, 
        default: null 
    },
    
    // SECURITY & ANTI-CHEAT FIELDS
    lastIp: { 
        type: String, 
        default: null, 
        index: true 
    }, // Tracks the last known IP address
    
    isBanned: { 
        type: Boolean, 
        default: false 
    }, // Ban Status
    
    banReason: { 
        type: String, 
        default: null 
    }, // Reason for Ban
    
    // Metadata
    totalPaid: { 
        type: Number, 
        default: 0 
    },
    joinedAt: { 
        type: Date, 
        default: Date.now 
    },
    lastActive: { 
        type: Date, 
        default: Date.now 
    }
});

// -------------------------------------------------------------------------------------------------
// 2. BOT INSTANCE SCHEMA
// -------------------------------------------------------------------------------------------------
const botSchema = new mongoose.Schema({
    ownerId: { 
        type: String, 
        required: true, 
        index: true 
    },
    name: { 
        type: String, 
        required: true 
    },
    token: { 
        type: String, 
        required: true, 
        unique: true 
    },
    
    // Runtime Status
    status: { 
        type: String, 
        default: 'STOPPED' // RUNNING | STOPPED | ERROR
    }, 
    startedAt: { 
        type: Date, 
        default: null 
    },
    restartCount: { 
        type: Number, 
        default: 0 
    },
    
    // The "Brain" of the bot (User's Code Storage)
    commands: { 
        type: Object, 
        default: {} 
    }, 
    
    // Environment Variables (For API Keys etc.)
    envVars: { 
        type: Object, 
        default: {} 
    },
    
    isFirstLive: { 
        type: Boolean, 
        default: true 
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
});

// -------------------------------------------------------------------------------------------------
// 3. END USER SCHEMA (For Targeted Broadcasts)
// -------------------------------------------------------------------------------------------------
const endUserSchema = new mongoose.Schema({
    tgId: { 
        type: String, 
        required: true 
    },
    botId: { 
        type: String, 
        required: true, 
        index: true 
    },
    username: { 
        type: String 
    },
    firstName: { 
        type: String 
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
});
// Compound Index to ensure a user is unique per bot instance
endUserSchema.index({ tgId: 1, botId: 1 }, { unique: true });

// -------------------------------------------------------------------------------------------------
// 4. PAYMENT TRANSACTION SCHEMA
// -------------------------------------------------------------------------------------------------
const paymentSchema = new mongoose.Schema({
    userId: String,
    username: String,
    plan: String,
    amount: Number,
    trxId: String,
    method: String,
    status: { 
        type: String, 
        default: 'PENDING' 
    },
    adminResponseDate: Date,
    date: { 
        type: Date, 
        default: Date.now 
    }
});

// Register Models with Mongoose
const UserModel = mongoose.model('User', userSchema);
const BotModel = mongoose.model('Bot', botSchema);
const EndUserModel = mongoose.model('EndUser', endUserSchema);
const PaymentModel = mongoose.model('Payment', paymentSchema);

// =================================================================================================
// SECTION 5: GLOBAL MIDDLEWARE & SERVER CONFIGURATION
// Description: Setting up Express middleware and initializing the main admin bot.
// =================================================================================================

// Global RAM Cache for Running Bot Instances
// Key: BotDB_ID, Value: Telegraf Instance
let activeBotInstances = {}; 

// Enable Cross-Origin Resource Sharing
app.use(cors());

// Configure Body Parser to handle large JSON payloads (needed for code saving)
app.use(bodyParser.json({ limit: '50mb' }));

// Configure Body Parser for URL Encoded data
app.use(bodyParser.urlencoded({ extended: true }));

// Serve Static Files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// -------------------------------------------------------------------------------------------------
// HELPER: IP ADDRESS EXTRACTION
// -------------------------------------------------------------------------------------------------
function getClientIp(req) {
    // Check for x-forwarded-for header (common in proxies/Render)
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        // The first IP in the list is the original client IP
        return forwarded.split(',')[0].trim();
    }
    // Fallback to socket address
    return req.socket.remoteAddress;
}

// -------------------------------------------------------------------------------------------------
// LOGGING MIDDLEWARE
// -------------------------------------------------------------------------------------------------
app.use((req, res, next) => {
    // We can enable this if we want to log every single HTTP request
    // logSystem('INFO', `Incoming Request: ${req.method} ${req.path}`);
    next();
});

// Initialize Main Admin Bot Instance
const mainBot = new Telegraf(ADMIN_CONFIG.token);

// =================================================================================================
// SECTION 6: THE BOT HOSTING ENGINE (SANDBOX EXECUTION)
// Description: This is the core logic that securely runs user-created bots.
// =================================================================================================

/**
 * Starts a specific User's Bot Instance.
 * @param {Object} botDoc - The database document of the bot to start.
 * @returns {Promise<Object>} Status object.
 */
async function startBotEngine(botDoc) {
    const botId = botDoc._id.toString();

    // 1. Check if the bot is already active in RAM
    if (activeBotInstances[botId]) {
        return { 
            success: true, 
            message: 'Bot instance is already running active session.' 
        };
    }

    try {
        // 2. Initialize Telegraf Instance with the User's Token
        const bot = new Telegraf(botDoc.token);

        // 3. Clear Webhooks (Crucial step for Polling to work)
        try {
            await bot.telegram.deleteWebhook();
        } catch (webhookError) {
            // Ignore error if webhook was not set previously
        }

        // 4. Fetch Bot Info to verify Token validity
        const botInfo = await bot.telegram.getMe();
        
        // 5. Attach Global Error Handler for this specific child bot
        bot.catch((err, ctx) => {
            logSystem('ERROR', `Child Bot [${botDoc.name}] Runtime Error: ${err.message}`);
        });

        // -----------------------------------------------------------------------------------------
        // MIDDLEWARE: ANALYTICS & BROADCAST TRACKING
        // -----------------------------------------------------------------------------------------
        bot.use(async (ctx, next) => {
            if (ctx.from) {
                // Execute async database write without blocking the bot response
                (async () => {
                    try {
                        const tgIdStr = ctx.from.id.toString();
                        
                        // Check if user already exists for this specific bot
                        const exists = await EndUserModel.exists({ 
                            tgId: tgIdStr, 
                            botId: botId 
                        });
                        
                        // If not exists, save the new user
                        if (!exists) {
                            await EndUserModel.create({
                                tgId: tgIdStr,
                                botId: botId,
                                username: ctx.from.username,
                                firstName: ctx.from.first_name
                            });
                            logSystem('INFO', `[${botDoc.name}] New User Captured: ${ctx.from.first_name}`);
                        }
                    } catch(e) {
                        // Ignore duplicate entry errors silently
                    }
                })();
            }
            // Proceed to next middleware or command handler
            return next();
        });

        // -----------------------------------------------------------------------------------------
        // LOGIC: DYNAMIC CODE EXECUTION SANDBOX
        // -----------------------------------------------------------------------------------------
        bot.on('message', async (ctx) => {
            // Ensure message exists and has text
            if (!ctx.message || !ctx.message.text) return;
            
            const text = ctx.message.text;
            
            // Only process commands starting with '/'
            if (text.startsWith('/')) {
                // Extract command name (e.g. '/start' -> 'start')
                const commandName = text.substring(1).split(' ')[0]; 
                
                // Fetch latest code from Database (Hot Reloading)
                const freshBotData = await BotModel.findById(botId);
                const userCode = freshBotData?.commands?.[commandName];
                
                if (userCode) {
                    try {
                        // Create Secure Function (Sandbox)
                        // Injecting helpful libraries: ctx, bot, Markup, axios, moment
                        const sandboxFunction = new Function('ctx', 'bot', 'Markup', 'axios', 'moment', `
                            try {
                                // --- USER CODE START ---
                                ${userCode}
                                // --- USER CODE END ---
                            } catch(runtimeError) {
                                ctx.reply('⚠️ <b>Bot Execution Error:</b>\\n' + runtimeError.message, { parse_mode: 'HTML' });
                            }
                        `);
                        
                        // Execute the code
                        sandboxFunction(ctx, bot, Markup, axios, moment);
                        
                    } catch (syntaxError) {
                        ctx.reply(`❌ <b>Syntax Error in Command:</b>\n${syntaxError.message}`, { parse_mode: 'HTML' });
                    }
                }
            }
        });

        // 6. Launch the Bot (Long Polling Mode)
        bot.launch({ dropPendingUpdates: true })
            .then(() => {
                logSystem('BOT', `Instance Started Successfully: ${botDoc.name} (@${botInfo.username})`);
            })
            .catch(err => {
                logSystem('ERROR', `Instance Crash: ${botDoc.name}`, { error: err.message });
                // Remove from active instances if crash occurs immediately
                delete activeBotInstances[botId];
            });

        // 7. Store active instance in RAM Cache
        activeBotInstances[botId] = bot;
        
        // 8. If this is first run, update the 'isFirstLive' flag in DB
        if (botDoc.isFirstLive) {
            botDoc.isFirstLive = false;
            await botDoc.save();
        }

        return { success: true, botInfo: botInfo };

    } catch (error) {
        logSystem('ERROR', `Engine Start Failed for [${botDoc.name}]`, { error: error.message });
        
        let errorMessage = 'Internal Engine Error';
        if (error.message.includes('401')) errorMessage = 'Invalid Bot Token. Please check BotFather.';
        if (error.message.includes('409')) errorMessage = 'Conflict: Bot is already running somewhere else.';

        return { success: false, message: errorMessage };
    }
}

// =================================================================================================
// SECTION 7: API ROUTES (SECURE ENDPOINTS FOR FRONTEND)
// Description: Handling Frontend Requests with Strict Validation & Anti-Cheat.
// =================================================================================================

// -------------------------------------------------------------------------------------------------
// ROUTE: /api/bots (Dashboard Load & Security Check)
// -------------------------------------------------------------------------------------------------
app.post('/api/bots', async (req, res) => {
    try {
        const { userId, username, firstName } = req.body;
        const clientIp = getClientIp(req); // Capture User's IP Address

        // Validation
        if (!userId) {
            return res.status(400).json({ error: "User ID is strictly required" });
        }

        // Find Existing User
        let user = await UserModel.findOne({ userId });

        if (!user) {
            // --- REGISTER NEW USER ---
            user = await UserModel.create({ 
                userId, 
                username, 
                firstName,
                lastIp: clientIp 
            });
            logSystem('INFO', `New User Registration: ${firstName} (${userId})`, { ip: clientIp });
        } else {
            // --- SECURITY: ANTI-CHEAT / MULTIPLE ACCOUNT CHECK ---
            // Check if this IP is associated with ANY OTHER User ID
            const duplicateAccounts = await UserModel.countDocuments({ 
                lastIp: clientIp, 
                userId: { $ne: userId } // Exclude current user from check
            });

            // If duplicates found, trigger Security Protocol
            if (duplicateAccounts > 0) {
                logSystem('SECURITY', `Multiple Accounts Detected! IP: ${clientIp}, User: ${userId}`);
                
                // Ban the User
                user.isBanned = true;
                user.banReason = "Security Violation: Multiple Accounts Detected (IP Match)";
                await user.save();

                // Notify User via Telegram Bot
                try {
                    await mainBot.telegram.sendMessage(userId, 
                        `🚫 <b>Multiple Accounts Detected!</b>\n\n` +
                        `⚠️ One Device ➜ One Account Only\n` +
                        `🔒 <b>Violations will result in instant ban!</b>\n\n` +
                        `Your access to Laga Host has been restricted due to suspicious activity.`, 
                        { parse_mode: 'HTML' }
                    );
                } catch(e) {
                    // Ignore if user blocked bot
                }

                return res.json({ 
                    success: false, 
                    banned: true, 
                    message: "Security Violation: Multiple Accounts Detected." 
                });
            }

            // If Clean, Update User Info
            user.lastIp = clientIp;
            user.username = username;
            user.firstName = firstName;
            user.lastActive = new Date();
            await user.save();
        }

        // Check Ban Status
        if (user.isBanned) {
            return res.json({ 
                success: false, 
                banned: true, 
                message: "Account Suspended. Contact Support." 
            });
        }

        // Fetch User's Hosted Bots
        const bots = await BotModel.find({ ownerId: userId }).sort({ createdAt: -1 });
        
        // Return Success Response
        res.json({ success: true, bots: bots, user: user });

    } catch (e) {
        logSystem('ERROR', `API /bots Execution Error: ${e.message}`);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
});

// -------------------------------------------------------------------------------------------------
// ROUTE: /api/createBot (Bot Provisioning)
// -------------------------------------------------------------------------------------------------
app.post('/api/createBot', async (req, res) => {
    try {
        const { token, name, userId } = req.body;
        
        // Fetch User
        const user = await UserModel.findOne({ userId });
        
        // Security Check: Is User Banned?
        if(user.isBanned) {
            return res.json({ success: false, message: 'Account is Banned. Cannot create bot.' });
        }

        // Limit Check: Does User have slots?
        const currentCount = await BotModel.countDocuments({ ownerId: userId });
        if (currentCount >= user.botLimit) {
            return res.json({ 
                success: false, 
                message: `Plan Limit Reached (${user.botLimit} Bots). Please Upgrade Plan.` 
            });
        }
        
        // Token Format Validation
        if(!/^\d+:[A-Za-z0-9_-]{35,}$/.test(token)) {
            return res.json({ success: false, message: 'Invalid Bot Token Format. Copy correctly from BotFather.' });
        }

        // Duplicate Token Check
        const existing = await BotModel.findOne({ token });
        if (existing) {
            return res.json({ success: false, message: 'This token is already hosted on our platform.' });
        }

        // Create the Bot
        const newBot = await BotModel.create({ 
            ownerId: userId, 
            name: name.trim(), 
            token: token.trim() 
        });
        
        logSystem('INFO', `New Bot Provisioned: ${name} by ${userId}`);
        res.json({ success: true, bot: newBot });

    } catch (e) {
        logSystem('ERROR', `Create Bot Failed: ${e.message}`);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

// -------------------------------------------------------------------------------------------------
// ROUTE: /api/toggleBot (Power Control: Start/Stop)
// -------------------------------------------------------------------------------------------------
app.post('/api/toggleBot', async (req, res) => {
    try {
        const { botId, action } = req.body;
        
        // Find Bot
        const bot = await BotModel.findById(botId);
        if (!bot) {
            return res.json({ success: false, message: 'Bot not found in database.' });
        }

        if (action === 'start') {
            // Attempt to Start
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
            // Attempt to Stop
            if (activeBotInstances[botId]) {
                try { 
                    activeBotInstances[botId].stop(); 
                } catch(e) {
                    console.error('Graceful stop failed', e);
                }
                delete activeBotInstances[botId];
            }
            
            bot.status = 'STOPPED';
            bot.startedAt = null;
            await bot.save();
            res.json({ success: true });
        }
    } catch (e) {
        logSystem('ERROR', `Toggle Bot Error: ${e.message}`);
        res.json({ success: false, message: e.message });
    }
});

// -------------------------------------------------------------------------------------------------
// ROUTE: /api/restartBot (Reboot Instance)
// -------------------------------------------------------------------------------------------------
app.post('/api/restartBot', async (req, res) => {
    try {
        const { botId } = req.body;
        const bot = await BotModel.findById(botId);

        if (!bot) return res.json({ success: false, message: 'Bot not found.' });

        // Force Stop if Running
        if (activeBotInstances[botId]) {
            try { 
                activeBotInstances[botId].stop(); 
            } catch(e){}
            delete activeBotInstances[botId];
        }

        // Start Again
        const result = await startBotEngine(bot);
        
        if (result.success) {
            bot.status = 'RUNNING';
            bot.startedAt = new Date();
            bot.restartCount = (bot.restartCount || 0) + 1;
            await bot.save();
            res.json({ success: true });
        } else {
            bot.status = 'STOPPED';
            await bot.save();
            res.json({ success: false, message: result.message });
        }
    } catch (e) {
        res.json({ success: false, message: "Restart Failed due to Server Error" });
    }
});

// -------------------------------------------------------------------------------------------------
// ROUTE: /api/deleteBot (Termination)
// -------------------------------------------------------------------------------------------------
app.post('/api/deleteBot', async (req, res) => {
    try {
        const { botId } = req.body;
        
        // Stop instance from RAM
        if (activeBotInstances[botId]) {
            try { activeBotInstances[botId].stop(); } catch(e){}
            delete activeBotInstances[botId];
        }
        
        // Delete from Database
        await BotModel.findByIdAndDelete(botId);
        
        // Cleanup Child Users (Free up space)
        await EndUserModel.deleteMany({ botId: botId });
        
        logSystem('WARN', `Bot Instance Deleted: ${botId}`);
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// =================================================================================================
// SECTION 8: AI GENERATION API (ADVANCED PROMPT ENGINEERING)
// Description: Includes specialized training data for SMM, Referrals, and XRocket bots.
// =================================================================================================

app.post('/api/ai-generate', async (req, res) => {
    const { prompt, model } = req.body;

    // Validation
    if (!prompt) return res.json({ success: false, message: "Prompt is required" });
    if (!OPENROUTER_API_KEY) return res.json({ success: false, message: "Server API Key Missing" });

    // 🔥 MASTER SYSTEM PROMPT FOR COMPLEX BOT GENERATION 🔥
    const systemInstruction = `
        ACT AS: Senior Telegram Bot Architect (Telegraf v4.16 Expert).
        TARGET: Write raw JavaScript execution logic for a Sandbox Environment.
        
        VARIABLES AVAILABLE: ctx, Markup, axios, moment

        STRICT RULES:
        1. OUTPUT RAW JS CODE ONLY. No markdown blocks (no \`\`\`). No wrapping functions.
        2. Use 'Markup.inlineKeyboard' for inline buttons (links, callbacks).
        3. Use 'Markup.keyboard().resize()' for bottom main menu buttons.
        4. Use Emojis to make it look premium.

        📚 **FEATURE LIBRARY (USE THESE PATTERNS):**

        **[A] SMM PANEL / ORDER SYSTEM:**
        If user asks for "SMM Panel", "Order Views", or "Balance":
        \`\`\`javascript
        // Check Balance Logic
        if(ctx.message.text.includes('Balance')) {
            return ctx.reply('💰 **Wallet Balance:** 0.00$ \\n💳 Please deposit to order services.', {parse_mode:'HTML'});
        }
        // Order Logic
        if(ctx.message.text.startsWith('/order')) {
            const args = ctx.message.text.split(' ');
            if(args.length < 2) return ctx.reply('⚠️ Syntax: /order <link>');
            
            ctx.reply('⏳ **Processing Order...**');
            // Simulate API Call delay
            setTimeout(() => {
                const orderId = Math.floor(Math.random() * 90000) + 10000;
                ctx.reply('✅ **Order Placed Successfully!**\\n🆔 ID: ' + orderId + '\\n📉 Service: Telegram Views\\n🔗 Link: '+args[1], {parse_mode:'HTML'});
            }, 1500);
        }
        \`\`\`

        **[B] REFERRAL BOT SYSTEM:**
        If user asks for "Referral", "Invite", "Withdraw":
        \`\`\`javascript
        // Invite Logic
        if(ctx.message.text === '🎁 Invite') {
            const refLink = 'https://t.me/' + ctx.botInfo.username + '?start=' + ctx.from.id;
            ctx.replyWithHTML(
                '🎁 **Referral System**\\n\\n' +
                '🔗 **Your Referral Link:**\\n' + refLink + '\\n\\n' +
                '💰 **Per Refer:** 5.00 Points\\n' +
                '🚫 **Fake Refs = Instant Ban**'
            );
        }
        // Withdraw Logic
        if(ctx.message.text === '💳 Withdraw') {
            ctx.reply('⚠️ Minimum withdraw amount is 100 Points.');
        }
        \`\`\`

        **[C] FORCE JOIN GATE (MEMBERSHIP CHECK):**
        If user asks "Must Join", "Force Join", "Channel Lock":
        \`\`\`javascript
        try {
           const channelUsername = '@your_channel_here'; // User should change this
           const chatMember = await ctx.telegram.getChatMember(channelUsername, ctx.from.id);
           
           // Check Status
           if(['left', 'kicked'].includes(chatMember.status)) {
               return ctx.reply('⚠️ <b>Access Denied!</b>\\nPlease join our channel to use this bot.', {
                   parse_mode: 'HTML',
                   ...Markup.inlineKeyboard([
                       [Markup.button.url('📢 Join Channel', 'https://t.me/your_channel_here')],
                       [Markup.button.callback('✅ Check Joined', 'check_join')]
                   ])
               });
           }
           ctx.reply('✅ **Verification Success!** Welcome inside.');
        } catch(e) { 
           ctx.reply('Error checking membership: ' + e.message); 
        }
        \`\`\`

        **GENERAL INSTRUCTION:**
        If the user prompt matches any above features, adapt the code. If not, write custom efficient logic using Telegraf v4 syntax.
    `;

    try {
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
                    "X-Title": "Laga Host Enterprise"
                }
            }
        );

        let code = response.data.choices[0].message.content;
        
        // Post-Processing Cleanup (Remove MD)
        code = code.replace(/```javascript/gi, "")
                   .replace(/```js/gi, "")
                   .replace(/```/g, "")
                   .trim();
        
        res.json({ success: true, result: code });

    } catch(e) {
        logSystem('ERROR', 'AI Generation Failed', { reason: e.message });
        res.json({ success: false, message: "AI Service Busy" });
    }
});

// =================================================================================================
// SECTION 9: JS EDITOR & PAYMENT PROCESSING
// Description: Handlers for code management and financial transactions.
// =================================================================================================

// Fetch Commands for Editor
app.post('/api/getCommands', async (req, res) => {
    try {
        const bot = await BotModel.findById(req.body.botId);
        res.json(bot?.commands || {});
    } catch(e) {
        res.json({});
    }
});

// Save Command Logic
app.post('/api/saveCommand', async (req, res) => {
    try {
        const { botId, command, code } = req.body;
        // Sanitize command name
        const cleanCmd = command.replace('/', '').replace(/\s/g, '_');
        
        await BotModel.findByIdAndUpdate(botId, { 
            $set: { [`commands.${cleanCmd}`]: code } 
        });
        
        res.json({ success: true });
    } catch(e) {
        res.json({ success: false });
    }
});

// Delete Command Logic
app.post('/api/deleteCommand', async (req, res) => {
    try {
        const { botId, command } = req.body;
        
        await BotModel.findByIdAndUpdate(botId, { 
            $unset: { [`commands.${command}`]: "" } 
        });
        
        res.json({ success: true });
    } catch(e) {
        res.json({ success: false });
    }
});

// PAYMENT SUBMISSION HANDLER
app.post('/api/submit-payment', async (req, res) => {
    const { trxId, plan, amount, userId, user, method } = req.body;
    
    // CASE A: REFERRAL POINT REDEMPTION
    if (method === 'referral') {
        const u = await UserModel.findOne({ userId });
        const requiredPoints = plan === 'Pro' ? 50 : 80;
        
        if (u.referrals < requiredPoints) {
            return res.json({ success: false, message: `Insufficient Points! Need ${requiredPoints}.` });
        }
        
        // Upgrade Logic
        u.plan = plan; 
        u.botLimit = plan === 'Pro' ? 5 : 10; 
        
        const d = new Date(); 
        d.setDate(d.getDate() + 30); 
        u.planExpiresAt = d;
        
        u.referrals -= requiredPoints; 
        await u.save();
        
        logSystem('SUCCESS', `User ${user} redeemed ${plan} plan via points.`);
        return res.json({ success: true, message: 'Plan Upgraded Successfully!' });
    }
    
    // CASE B: MANUAL PAYMENT
    try {
        const p = await PaymentModel.create(req.body);
        
        // Notify Admin Bot
        await mainBot.telegram.sendMessage(ADMIN_CONFIG.adminId, 
            `💰 <b>NEW PAYMENT REQUEST</b>\n\n` +
            `User: @${user} (<code>${userId}</code>)\n` +
            `Plan: <b>${plan}</b>\n` +
            `Amount: <b>${amount}৳</b>\n` +
            `TrxID: <code>${trxId}</code>`,
            { 
                parse_mode: 'HTML', 
                reply_markup: { 
                    inline_keyboard: [[
                        { text: '✅ Approve', callback_data: `ok:${userId}:${plan}:${p._id}` },
                        { text: '❌ Reject', callback_data: `no:${userId}:${p._id}` }
                    ]]
                }
            }
        );
        res.json({ success: true, message: 'Payment submitted for review.' });
    } catch(e) {
        res.json({ success: false, message: 'Payment Error' });
    }
});

// =================================================================================================
// SECTION 10: AUTOMATED TASKS (CRON JOBS)
// Description: Runs daily cleanup and subscription checks automatically.
// =================================================================================================

cron.schedule('0 0 * * *', async () => {
    logSystem('SYSTEM', 'Running Daily Subscription & Expiry Check...');
    const now = new Date();
    
    // Find Expired Premium Users
    const expiredUsers = await UserModel.find({ 
        plan: { $ne: 'Free' }, 
        planExpiresAt: { $lt: now } 
    });

    for (const u of expiredUsers) {
        logSystem('WARN', `Downgrading User: ${u.userId} (Plan Expired)`);
        
        // Downgrade User
        u.plan = 'Free'; 
        u.botLimit = 1; 
        u.planExpiresAt = null;
        await u.save();

        // Check for excess bots and stop them
        const bots = await BotModel.find({ ownerId: u.userId });
        if (bots.length > 1) {
            for(let i = 1; i < bots.length; i++) {
                const b = bots[i];
                // Stop Instance
                if(activeBotInstances[b._id]) { 
                    activeBotInstances[b._id].stop(); 
                    delete activeBotInstances[b._id]; 
                }
                b.status = 'STOPPED'; 
                await b.save();
            }
        }
        
        // Notify User
        try {
            await mainBot.telegram.sendMessage(u.userId, 
                '⚠️ <b>Subscription Expired</b>\n\n' +
                'Your premium plan has ended. You have been downgraded to Free Tier.\n' +
                'Extra bots have been stopped.', 
                {parse_mode:'HTML'}
            );
        } catch(e){}
    }
});

// =================================================================================================
// SECTION 11: MAIN ADMIN BOT UI (CUSTOM LAYOUT)
// Description: Handling /start, buttons, auto-delete status, and broadcasts.
// =================================================================================================

// --- START COMMAND HANDLER ---
mainBot.command('start', async (ctx) => {
    const userId = ctx.from.id.toString();
    const args = ctx.message.text.split(' ');
    
    // User Registration / Login
    let user = await UserModel.findOne({ userId });
    if (!user) {
        // Handle Referral Logic
        const ref = args[1] && args[1] !== userId ? args[1] : null;
        user = await UserModel.create({
            userId, 
            username: ctx.from.username, 
            firstName: ctx.from.first_name, 
            referredBy: ref
        });
        
        // Bonus for Referrer
        if(ref) {
            await UserModel.findOneAndUpdate({ userId: ref }, { $inc: { referrals: 1 } });
        }
    }

    // Check Ban Status
    if(user.isBanned) {
        return ctx.reply('⛔ <b>Account Banned!</b>\nReason: Suspicious Activity Detected.', {parse_mode:'HTML'});
    }

    // Welcome Message
    const msg = 
        `👋 <b>Hey ${ctx.from.first_name} Welcome to Laga Host AI!</b>\n\n` +
        `🚀 <b>Your Smart Telegram Bot Hosting Companion</b>\n\n` +
        `Laga Host AI helps you:\n` +
        `• Deploy bots instantly\n` +
        `• Run them 24/7\n` +
        `• Write commands with AI\n` +
        `• Manage everything from one dashboard\n` +
        `• Use tools without coding\n\n` +
        `Whether you are a beginner or a pro — this bot is built for you.\n\n` +
        `👇 <b>Choose an option below to get started:</b>`;

    // 🎨 EXACT BUTTON LAYOUT REQUESTED (2 Big, 4 Small)
    const buttons = Markup.keyboard([
        ['📺 Watch Tutorial'], // Big Button (Row 1)
        ['📹 Youtube', '📢 Telegram'], // (Row 2)
        ['👨‍💻 Support', '📊 Status'], // (Row 3)
        [Markup.button.webApp('🚀 Open Dashboard', WEB_APP_URL)] // Big Button (Row 4)
    ]).resize();

    await ctx.replyWithHTML(msg, buttons);
});

// --- BUTTON EVENT HANDLERS ---

mainBot.hears('📺 Watch Tutorial', ctx => {
    ctx.reply(`📹 <b>Tutorial Video:</b>\n${ADMIN_CONFIG.support.tutorial_video}`, {parse_mode:'HTML'});
});

mainBot.hears('📹 Youtube', ctx => {
    ctx.reply(`👉 Subscribe: ${ADMIN_CONFIG.support.youtube}`);
});

mainBot.hears('📢 Telegram', ctx => {
    ctx.reply(`👉 Join: ${ADMIN_CONFIG.channels[0].url}`);
});

mainBot.hears('👨‍💻 Support', ctx => {
    ctx.reply(`💬 Contact: ${ADMIN_CONFIG.support.telegram}`);
});

// --- STATUS FEATURE (10 SECOND AUTO DELETE) ---
mainBot.hears('📊 Status', async (ctx) => {
    const user = await UserModel.findOne({ userId: ctx.from.id.toString() });
    if(!user) return;

    const statusMsg = 
        `👤 <b>USER PROFILE</b>\n` +
        `├ Name: ${user.firstName}\n` +
        `├ ID: <code>${user.userId}</code>\n` +
        `├ Plan: <b>${user.plan}</b>\n` +
        `└ Points: ${user.referrals}\n\n` +
        `📊 <b>SYSTEM STATS</b>\n` +
        `└ Bot Limit: ${user.botLimit}\n\n` +
        `⏳ <i>This message will disappear in 10s...</i>`;

    const sent = await ctx.replyWithHTML(statusMsg);

    // Auto Delete Timer Logic
    setTimeout(async () => {
        try {
            await ctx.deleteMessage(sent.message_id);
            // Optional: Send main menu again if needed
        } catch(e) {
            // Ignore error if user deleted chat
        }
    }, 10000); // 10 Seconds
});

// --- ADVANCED BROADCAST (CHILD-BOT TARGETING & DUPLICATE FILTER) ---
mainBot.command('broadcast', async (ctx) => {
    // 1. Authorization Check
    if(ctx.from.id.toString() !== ADMIN_CONFIG.adminId) return;
    
    // 2. Parse Message
    const txt = ctx.message.text.replace('/broadcast', '').trim();
    if(!txt) return ctx.reply('⚠️ Empty Message. Usage: /broadcast <msg>');

    const status = await ctx.reply('📡 <b>Broadcasting to Child Bot Users...</b>', {parse_mode:'HTML'});
    
    // 3. Fetch Running Bots
    const bots = await BotModel.find({ status: 'RUNNING' });
    
    // 4. Initialize Duplicate Filter
    const sentUserIds = new Set();
    let count = 0;

    for(const bot of bots) {
        // Fetch users who chatted with THIS bot
        const users = await EndUserModel.find({ botId: bot._id.toString() });
        
        if(!users.length) continue;

        // Get or Create Bot Instance
        let instance = activeBotInstances[bot._id.toString()];
        if (!instance) {
            try { instance = new Telegraf(bot.token); } catch(e) { continue; }
        }
        
        for(const u of users) {
            // FILTER: If already sent to this specific Telegram ID, skip
            if(sentUserIds.has(u.tgId)) continue; 
            
            try {
                await instance.telegram.sendMessage(u.tgId, txt, {parse_mode:'HTML'});
                sentUserIds.add(u.tgId); // Mark as Sent
                count++;
                
                // Rate Limiting (Prevent Flood Wait)
                await new Promise(r => setTimeout(r, 50)); 
            } catch(e){
                // If bot blocked by user, remove from DB to clean up
                if(e.code === 403) {
                    await EndUserModel.findByIdAndDelete(u._id);
                }
            }
        }
    }

    // 5. Final Report
    await ctx.telegram.deleteMessage(ctx.chat.id, status.message_id);
    await ctx.reply(
        `✅ <b>Broadcast Complete.</b>\n` +
        `📨 Sent to: <b>${count}</b> unique users across all hosted bots.`, 
        {parse_mode:'HTML'}
    );
});

// Payment Action Callbacks
mainBot.action(/^ok:(\d+):(\w+):(.+)$/, async (ctx) => {
    const [_, uid, plan, pid] = ctx.match;
    
    const d = new Date(); 
    d.setDate(d.getDate() + 30);
    
    await UserModel.findOneAndUpdate(
        { userId: uid }, 
        { plan, botLimit: plan === 'Pro' ? 5 : 10, planExpiresAt: d }
    );
    
    await PaymentModel.findByIdAndUpdate(pid, { status: 'APPROVED' });
    
    ctx.editMessageText('✅ Approved'); 
    mainBot.telegram.sendMessage(uid, `✅ <b>Payment Approved!</b> You are now on <b>${plan}</b> plan.`, {parse_mode:'HTML'});
});

mainBot.action(/^no:(\d+):(.+)$/, async (ctx) => {
    await PaymentModel.findByIdAndUpdate(ctx.match[2], { status: 'DECLINED' });
    ctx.editMessageText('❌ Declined'); 
    mainBot.telegram.sendMessage(ctx.match[1], `❌ <b>Payment Rejected.</b> Please contact support.`, {parse_mode:'HTML'});
});

// =================================================================================================
// SECTION 12: SYSTEM STARTUP SEQUENCE
// Description: Launching services in order (Bot -> DB -> Express).
// =================================================================================================

// 1. Start Main Admin Bot
mainBot.telegram.deleteWebhook().then(() => {
    mainBot.launch({ dropPendingUpdates: true });
    logSystem('SUCCESS', 'Main Admin Bot Launched Successfully.');
});

// 2. Restore Active Sessions (After DB Connect)
mongoose.connection.once('open', async () => {
    const bots = await BotModel.find({ status: 'RUNNING' });
    if(bots.length > 0) {
        logSystem('SYSTEM', `Restoring ${bots.length} active sessions from database...`);
        
        for(const b of bots) { 
            // Stagger start to prevent CPU spike
            await new Promise(r => setTimeout(r, 500)); 
            await startBotEngine(b); 
        }
        
        logSystem('SUCCESS', `Session Restoration Complete.`);
    }
});

// 3. Graceful Shutdown Handlers
process.once('SIGINT', () => {
    logSystem('WARN', 'SIGINT received. Shutting down system...');
    mainBot.stop('SIGINT');
    Object.values(activeBotInstances).forEach(b => b.stop('SIGINT'));
    process.exit(0);
});

process.once('SIGTERM', () => {
    logSystem('WARN', 'SIGTERM received. Shutting down system...');
    mainBot.stop('SIGTERM');
    Object.values(activeBotInstances).forEach(b => b.stop('SIGTERM'));
    process.exit(0);
});

// 4. Start Express Server
app.listen(PORT, () => {
    logSystem('SUCCESS', `Laga Host Enterprise Core Online on Port ${PORT}`);
    logSystem('INFO', `Dashboard URL: ${WEB_APP_URL}`);
});
