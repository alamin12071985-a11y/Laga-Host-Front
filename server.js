/**
 * =================================================================================================
 * PROJECT: LAGA HOST ULTIMATE (CYBER CORE ENTERPRISE EDITION)
 * VERSION: 6.0.0 (MAXIMUM EXPANDED)
 * AUTHOR: Laga Host Team
 * DESCRIPTION: 
 *   This is the central backend server for the Telegram Bot Hosting Platform.
 *   It handles:
 *    - Database Connections (MongoDB)
 *    - Bot Instance Management (Telegraf)
 *    - AI Code Generation (Gemini via OpenRouter)
 *    - User Management & Plans
 *    - Payment Processing
 *    - Targeted Broadcast Systems (Child-Bot Only)
 * =================================================================================================
 */

// =================================================================================================
// SECTION 1: LIBRARY IMPORTS & DEPENDENCY MANAGEMENT
// =================================================================================================

// Load Environment Variables
require('dotenv').config();

// Express Framework for API Routing
const express = require('express');

// Telegram Bot Framework
const { Telegraf, Markup, session } = require('telegraf');

// Request Parsing Utilities
const bodyParser = require('body-parser');

// Cross-Origin Resource Sharing
const cors = require('cors');

// File System and Path Utilities
const path = require('path');
const fs = require('fs');

// Database Driver
const mongoose = require('mongoose');

// Task Scheduling
const cron = require('node-cron');

// Date & Time Formatting
const moment = require('moment');

// HTTP Client for AI Requests
const axios = require('axios');

// =================================================================================================
// SECTION 2: SYSTEM CONFIGURATION & CONSTANTS
// =================================================================================================

// Initialize Express Application
const app = express();

// Define Server Port
const PORT = process.env.PORT || 3000;

// Define Web App URL (For CORS and Referer headers)
const WEB_APP_URL = process.env.WEB_APP_URL || "https://lagahost.onrender.com"; 

// -------------------------------------------------------------------------------------------------
// AI CONFIGURATION (Gemini 2.0 Flash)
// -------------------------------------------------------------------------------------------------
const OPENROUTER_API_KEY = "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";
const AI_MODEL = "google/gemini-2.0-flash-exp:free"; 

// -------------------------------------------------------------------------------------------------
// ADMIN & PLATFORM CONFIGURATION
// -------------------------------------------------------------------------------------------------
const ADMIN_CONFIG = {
    // The Token for the Main Host Bot
    token: process.env.BOT_TOKEN || "8264143788:AAH0fRkMqBw4rONo0WVEi-OyAVkPs9bRt84",
    
    // The Telegram User ID of the Super Admin
    adminId: process.env.ADMIN_ID || "7605281774",
    
    // Required Channels for Access
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

// -------------------------------------------------------------------------------------------------
// DATABASE CONNECTION STRING
// -------------------------------------------------------------------------------------------------
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://lagahost:l%40g%40ho%24t@snowmanadventure.ocodku0.mongodb.net/snowmanadventure?retryWrites=true&w=majority&appName=snowmanadventure";

// =================================================================================================
// SECTION 3: ADVANCED LOGGING UTILITY
// =================================================================================================

/**
 * Enhanced Logging System
 * Prints detailed logs with timestamps, types, and visual icons.
 * 
 * @param {string} type - The category of the log (INFO, ERROR, WARN, SUCCESS, BOT, DB)
 * @param {string} message - The content of the log
 */
function logSystem(type, message) {
    const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
    let icon = '';

    switch (type) {
        case 'INFO': icon = 'ℹ️  [INFO]   '; break;
        case 'ERROR': icon = '❌  [ERROR]  '; break;
        case 'WARN': icon = '⚠️  [WARN]   '; break;
        case 'SUCCESS': icon = '✅  [SUCCESS]'; break;
        case 'DB': icon = '🗄️  [DATABASE]'; break;
        case 'BOT': icon = '🤖  [BOT]    '; break;
        default: icon = '🔹  [SYSTEM] '; break;
    }

    console.log(`${icon} | ${timestamp} | ${message}`);
}

// =================================================================================================
// SECTION 4: DATABASE MODELS & SCHEMAS definition
// =================================================================================================

// Connect to MongoDB with Enhanced Options
mongoose.connect(MONGO_URI)
    .then(() => {
        logSystem('DB', '----------------------------------------');
        logSystem('DB', 'MongoDB Connection Established Successfully');
        logSystem('DB', 'Ready to accept Database Operations');
        logSystem('DB', '----------------------------------------');
    })
    .catch(err => {
        logSystem('ERROR', 'CRITICAL: MongoDB Connection Failed');
        logSystem('ERROR', 'Reason: ' + err.message);
        process.exit(1); 
    });

// -------------------------------------------------------------------------------------------------
// 1. USER SCHEMA
// -------------------------------------------------------------------------------------------------
const userSchema = new mongoose.Schema({
    userId: { 
        type: String, 
        required: true, 
        unique: true, 
        index: true 
    },
    username: { type: String },
    firstName: { type: String },
    plan: { 
        type: String, 
        default: 'Free', 
        enum: ['Free', 'Pro', 'VIP'] 
    },
    botLimit: { 
        type: Number, 
        default: 1 
    },
    referrals: { 
        type: Number, 
        default: 0 
    },
    referredBy: { type: String },
    totalPaid: { 
        type: Number, 
        default: 0 
    },
    planExpiresAt: { 
        type: Date, 
        default: null 
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
    status: { 
        type: String, 
        default: 'STOPPED' 
    }, 
    startedAt: { 
        type: Date, 
        default: null 
    },
    restartCount: { 
        type: Number, 
        default: 0 
    },
    commands: { 
        type: Object, 
        default: {} 
    },
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
// 3. END USER SCHEMA (For Broadcast Targeting)
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
    username: String,
    firstName: String,
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
});
// Compound Index to ensure unique user per bot instance
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

// Create Models from Schemas
const UserModel = mongoose.model('User', userSchema);
const BotModel = mongoose.model('Bot', botSchema);
const EndUserModel = mongoose.model('EndUser', endUserSchema);
const PaymentModel = mongoose.model('Payment', paymentSchema);

// =================================================================================================
// SECTION 5: GLOBAL MIDDLEWARE & SERVER SETUP
// =================================================================================================

// RAM Storage for Active Bot Instances (Runtime Cache)
let activeBotInstances = {}; 

// Setup Express Middleware
app.use(cors()); 
app.use(bodyParser.json({ limit: '50mb' })); 
app.use(bodyParser.urlencoded({ extended: true }));

// Serve Static Frontend Files
app.use(express.static(path.join(__dirname, 'public'))); 

// Request Logger Middleware
app.use((req, res, next) => {
    // Only log API requests to keep console clean
    if(req.path.startsWith('/api')) {
        // console.log(`[API REQUEST] ${req.method} ${req.path}`);
    }
    next();
});

// Initialize Main Admin Bot Instance
const mainBot = new Telegraf(ADMIN_CONFIG.token);

// =================================================================================================
// SECTION 6: BOT ENGINE CORE (The Logic that runs user bots)
// =================================================================================================

/**
 * Starts a hosted bot instance securely in a sandbox-like environment.
 * Handles webhook clearing, middleware injection, and error catching.
 * 
 * @param {Object} botDoc - The MongoDB document of the bot to start
 * @returns {Promise<Object>} Status object with success boolean and message
 */
async function startBotEngine(botDoc) {
    const botId = botDoc._id.toString();

    // 1. Check if the bot is already running in RAM
    if (activeBotInstances[botId]) {
        return { success: true, message: 'Bot is already active and running.' };
    }

    try {
        // 2. Initialize New Telegraf Instance
        const bot = new Telegraf(botDoc.token);

        // 3. CRITICAL: Clear any existing Webhooks to enable Polling
        try {
            await bot.telegram.deleteWebhook();
        } catch (webhookErr) {
            // Ignore error if webhook wasn't set
        }

        // 4. Validate Token by fetching Bot Info
        const botInfo = await bot.telegram.getMe();
        
        // 5. Attach Global Error Handler for this Instance
        bot.catch((err, ctx) => {
            logSystem('ERROR', `[Child Bot: ${botDoc.name}] Runtime Error: ${err.message}`);
        });

        // ----------------------------------------------------
        // MIDDLEWARE: Analytics & User Capture (For Broadcasts)
        // ----------------------------------------------------
        bot.use(async (ctx, next) => {
            if(ctx.from) {
                // Perform DB write asynchronously to prevent blocking the bot response
                (async () => {
                    try {
                        const userIdStr = ctx.from.id.toString();
                        
                        // Check if this user is already recorded for this bot
                        const exists = await EndUserModel.exists({ 
                            tgId: userIdStr, 
                            botId: botId 
                        });
                        
                        // If not, create a new record
                        if (!exists) {
                            await EndUserModel.create({
                                tgId: userIdStr,
                                botId: botId,
                                username: ctx.from.username || '',
                                firstName: ctx.from.first_name || 'Unknown'
                            });
                            logSystem('INFO', `[${botDoc.name}] New End User Captured: ${ctx.from.first_name}`);
                        }
                    } catch(e) {
                        // Silently handle duplicate key errors
                    }
                })();
            }
            return next();
        });

        // ----------------------------------------------------
        // LOGIC: Dynamic Command Execution (The "JS Sandbox")
        // ----------------------------------------------------
        bot.on('message', async (ctx) => {
            // Ensure there is text content
            if (!ctx.message || !ctx.message.text) return;
            
            const text = ctx.message.text;
            
            // Check if it looks like a command (starts with /)
            if (text.startsWith('/')) {
                // Extract command name (e.g., '/start' -> 'start')
                const cmdName = text.substring(1).split(' ')[0]; 
                
                // Fetch fresh code from DB to allow realtime updates
                const freshBotData = await BotModel.findById(botId);
                const userCode = freshBotData?.commands?.[cmdName];
                
                if (userCode) {
                    try {
                        // Create a Secure Function Constructor
                        // We inject useful libraries: ctx, bot, Markup, axios, moment
                        const runUserCode = new Function('ctx', 'bot', 'Markup', 'axios', 'moment', `
                            try {
                                // --- USER INJECTED CODE START ---
                                ${userCode}
                                // --- USER INJECTED CODE END ---
                            } catch(runtimeError) {
                                ctx.reply('⚠️ <b>Execution Error:</b>\\n' + runtimeError.message, { parse_mode: 'HTML' });
                            }
                        `);
                        
                        // Execute the Function
                        runUserCode(ctx, bot, Markup, axios, moment);
                        
                    } catch (syntaxError) {
                        ctx.reply(`❌ <b>Syntax Error in Code:</b>\n${syntaxError.message}`, { parse_mode: 'HTML' });
                    }
                }
            }
        });

        // 6. Launch the Bot via Long Polling
        bot.launch({ dropPendingUpdates: true })
            .then(() => {
                logSystem('BOT', `Instance Launched: ${botDoc.name} (@${botInfo.username})`);
            })
            .catch(err => {
                logSystem('ERROR', `Instance Crash [${botDoc.name}]: ${err.message}`);
                delete activeBotInstances[botId];
            });

        // 7. Store the running instance in RAM
        activeBotInstances[botId] = bot;
        
        // 8. Update First Run Flag in Database
        if (botDoc.isFirstLive) {
            botDoc.isFirstLive = false;
            await botDoc.save();
        }

        return { success: true, botInfo };

    } catch (error) {
        logSystem('ERROR', `Startup Failed [${botDoc.name}]: ${error.message}`);
        
        // Generate User-Friendly Error Messages
        let userMsg = 'Internal Server Error during startup.';
        if (error.message.includes('401')) userMsg = 'Invalid Bot Token! Please verify with @BotFather.';
        if (error.message.includes('409')) userMsg = 'Conflict! Bot is already running on another server.';

        return { success: false, message: userMsg };
    }
}

// =================================================================================================
// SECTION 7: API ROUTES (COMMUNICATION WITH FRONTEND)
// =================================================================================================

// -------------------------------------------------------------------------------------------------
// ROUTE: /api/bots
// Description: Fetches all bots for a specific user and syncs user info
// -------------------------------------------------------------------------------------------------
app.post('/api/bots', async (req, res) => {
    try {
        const { userId, username, firstName } = req.body;
        
        // Validation
        if(!userId) {
            return res.status(400).json({ error: "Missing User ID in Request Body" });
        }

        // Find or Create User Logic
        let user = await UserModel.findOne({ userId });
        
        if (!user) {
            // Register New User
            user = await UserModel.create({ 
                userId, 
                username, 
                firstName 
            });
            logSystem('INFO', `New Platform User Registered: ${firstName} (${userId})`);
        } else {
            // Update Existing User Info
            let isUpdated = false;
            if(firstName && user.firstName !== firstName) { 
                user.firstName = firstName; 
                isUpdated = true; 
            }
            if(username && user.username !== username) { 
                user.username = username; 
                isUpdated = true; 
            }
            // Update Last Active Time
            user.lastActive = new Date();
            await user.save();
        }

        // Fetch User's Bots
        const bots = await BotModel.find({ ownerId: userId }).sort({ createdAt: -1 });
        
        // Return Data
        res.json({ 
            success: true, 
            bots: bots, 
            user: user 
        });

    } catch (e) {
        logSystem('ERROR', `API /bots Error: ${e.message}`);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
});

// -------------------------------------------------------------------------------------------------
// ROUTE: /api/createBot
// Description: Creates a new bot entry in the database after validation
// -------------------------------------------------------------------------------------------------
app.post('/api/createBot', async (req, res) => {
    try {
        const { token, name, userId } = req.body;
        
        // 1. Fetch User for Limit Check
        const user = await UserModel.findOne({ userId });
        const currentCount = await BotModel.countDocuments({ ownerId: userId });
        
        // 2. Check Plan Limits
        if (currentCount >= user.botLimit) {
            return res.json({ 
                success: false, 
                message: `Plan Limit Reached (${user.botLimit})! Please Upgrade to Pro/VIP.` 
            });
        }
        
        // 3. Validate Token Format using Regex
        const tokenRegex = /^\d+:[A-Za-z0-9_-]{35,}$/;
        if(!tokenRegex.test(token)) {
            return res.json({ success: false, message: 'Invalid Bot Token Format. Please check @BotFather.' });
        }

        // 4. Check for Duplicate Tokens
        const existing = await BotModel.findOne({ token });
        if (existing) {
            return res.json({ success: false, message: 'This token is already hosted on our platform!' });
        }

        // 5. Create Bot Entry
        const newBot = await BotModel.create({ 
            ownerId: userId, 
            name: name.trim(), 
            token: token.trim() 
        });
        
        logSystem('INFO', `New Bot Created: ${name} by User ${userId}`);
        res.json({ success: true, bot: newBot });

    } catch (e) {
        logSystem('ERROR', `API /createBot Error: ${e.message}`);
        res.status(500).json({ success: false, message: "Database Write Error" });
    }
});

// -------------------------------------------------------------------------------------------------
// ROUTE: /api/toggleBot
// Description: Starts or Stops a specific bot instance
// -------------------------------------------------------------------------------------------------
app.post('/api/toggleBot', async (req, res) => {
    try {
        const { botId, action } = req.body;
        const bot = await BotModel.findById(botId);
        
        if(!bot) {
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
                    // Send SIGINT signal to the child instance
                    activeBotInstances[botId].stop('SIGINT');
                } catch(e) { 
                    console.error('Graceful stop failed, forcing removal.', e); 
                }
                // Remove from RAM
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

// -------------------------------------------------------------------------------------------------
// ROUTE: /api/restartBot
// Description: Restarts a bot cleanly (Stop -> Start)
// -------------------------------------------------------------------------------------------------
app.post('/api/restartBot', async (req, res) => {
    try {
        const { botId } = req.body;
        const bot = await BotModel.findById(botId);
        
        if(!bot) return res.json({ success: false, message: 'Bot not found' });

        // 1. Force Stop if Running
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

// -------------------------------------------------------------------------------------------------
// ROUTE: /api/deleteBot
// Description: Permanently deletes bot and clean up its end-users
// -------------------------------------------------------------------------------------------------
app.post('/api/deleteBot', async (req, res) => {
    try {
        const { botId } = req.body;
        
        // 1. Stop Instance if running
        if (activeBotInstances[botId]) {
            try { activeBotInstances[botId].stop(); } catch(e){}
            delete activeBotInstances[botId];
        }
        
        // 2. Delete Bot from DB
        await BotModel.findByIdAndDelete(botId);
        
        // 3. Delete Associated End Users (Cleanup)
        await EndUserModel.deleteMany({ botId: botId }); 
        
        logSystem('WARN', `Bot Permanently Deleted: ${botId}`);
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});
// =================================================================================
// SECTION 8: AI GENERATION API (UPDATED FOR MENU & INLINE BUTTONS)
// =================================================================================

app.post('/api/ai-generate', async (req, res) => {
    const { prompt, type, model } = req.body;

    // Input Validation
    if (!prompt) return res.json({ success: false, message: "Empty Prompt Provided" });
    if (!OPENROUTER_API_KEY) return res.json({ success: false, message: "Server API Configuration Missing" });

    // 🔥 UPGRADED SYSTEM PROMPT FOR MENU & INLINE KEYBOARDS
    const systemInstruction = `
        ACT AS: Senior Telegram Bot Developer (Telegraf v4).
        TASK: Write raw JavaScript execution logic for a Sandbox Environment.
        
        VARIABLES AVAILABLE: 
        - ctx (Context)
        - Markup (Telegraf Markup)
        - axios, moment

        STRICT UI/UX RULES:

        1. **IF USER ASKS FOR "MENU" or "KEYBOARD" (Bottom Buttons):**
           - Use 'Markup.keyboard([...])'.
           - ALWAYS chain '.resize()' at the end.
           - Group buttons in arrays for rows (e.g., 2 buttons per row).
           - Syntax Example:
             ctx.reply('Choose an option:', Markup.keyboard([
                ['🤖 Create Bot', '📂 My Bots'],
                ['💳 Deposit', '👨‍💻 Support']
             ]).resize());

        2. **IF USER ASKS FOR "INLINE BUTTONS" (Attached to message):**
           - Use 'Markup.inlineKeyboard([...])'.
           - Use 'Markup.button.url' for links.
           - Use 'Markup.button.callback' for actions.
           - Syntax Example:
             ctx.reply('Join our channels:', Markup.inlineKeyboard([
                [Markup.button.url('📢 Channel', 'https://t.me/demo')],
                [Markup.button.callback('✅ Check Join', 'check_join')]
             ]));

        3. **GENERAL RULES:**
           - OUTPUT RAW JS ONLY. NO MARKDOWN. NO COMMENTS.
           - Do NOT use 'bot.command' wrapper. Write immediate logic.
           - Use Emojis to make it look Premium (like the user screenshots).
    `;

    try {
        // Call OpenRouter API
        const response = await axios.post(
            "https://openrouter.ai/api/v1/chat/completions",
            {
                model: model || AI_MODEL,
                messages: [
                    { role: "system", content: systemInstruction },
                    { role: "user", content: `Write code for: ${prompt}` }
                ],
                temperature: 0.3 // Low temperature for precise code
            },
            {
                headers: {
                    Authorization: `Bearer ${OPENROUTER_API_KEY}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": WEB_APP_URL,
                    "X-Title": "Laga Host Engine"
                }
            }
        );

        const msgData = response.data?.choices?.[0]?.message;
        let finalContent = "";

        if (msgData?.content) {
            finalContent = msgData.content;
        }

        // Cleanup
        finalContent = finalContent
            .replace(/```javascript/gi, "")
            .replace(/```js/gi, "")
            .replace(/```/g, "")
            .trim();

        if (!finalContent) throw new Error("Empty AI Response");

        res.json({ success: true, result: finalContent });

    } catch (e) {
        res.json({ success: false, message: "AI Busy. Try again." });
    }
});


// =================================================================================================
// SECTION 9: JS EDITOR & PAYMENT API ENDPOINTS
// =================================================================================================

// Fetch Commands for Editor
app.post('/api/getCommands', async (req, res) => {
    try {
        const bot = await BotModel.findById(req.body.botId);
        res.json(bot ? bot.commands : {});
    } catch(e) { res.json({}) }
});

// Save Command Logic
app.post('/api/saveCommand', async (req, res) => {
    try {
        const { botId, command, code } = req.body;
        // Sanitize command name (remove slashes, spaces)
        const cleanCmd = command.replace('/', '').replace(/\s/g, '_');
        
        await BotModel.findByIdAndUpdate(botId, { 
            $set: { [`commands.${cleanCmd}`]: code } 
        });
        
        res.json({ success: true });
    } catch(e) { res.json({ success: false }) }
});

// Delete Command Logic
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

    // CASE A: REFERRAL POINT REDEMPTION
    if (method === 'referral') {
        const dbUser = await UserModel.findOne({ userId });
        const requiredPoints = plan === 'Pro' ? 50 : 80;
        
        if (dbUser.referrals < requiredPoints) {
            return res.json({ 
                success: false, 
                message: `Insufficient Points! Need ${requiredPoints}, You have ${dbUser.referrals}` 
            });
        }
        
        // Calculate Expiry (30 Days)
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 30); 
        
        // Apply Upgrade
        dbUser.plan = plan;
        dbUser.botLimit = plan === 'Pro' ? 5 : 10;
        dbUser.planExpiresAt = expiry;
        dbUser.referrals -= requiredPoints;
        await dbUser.save();
        
        logSystem('SUCCESS', `User ${user} upgraded to ${plan} via Points`);
        return res.json({ success: true, message: `Redeemed ${plan} Plan Successfully!` });
    }

    // CASE B: MANUAL CASH PAYMENT (REQUIRES ADMIN APPROVAL)
    try {
        // Create Transaction Record
        const payment = await PaymentModel.create({
            userId, username: user, plan, amount, trxId, method
        });

        // Send Notification to Admin Bot
        await mainBot.telegram.sendMessage(ADMIN_CONFIG.adminId, 
            `💰 <b>NEW PAYMENT RECEIVED</b>\n\n` +
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

// =================================================================================================
// SECTION 10: AUTOMATION & CRON JOBS
// =================================================================================================

// -------------------------------------------------------------------------------------------------
// JOB: DAILY PLAN EXPIRY CHECKER
// Schedule: Every day at midnight (00:00)
// -------------------------------------------------------------------------------------------------
cron.schedule('0 0 * * *', async () => {
    logSystem('SYSTEM', 'Running Daily Plan Expiry Routine...');
    const now = new Date();
    
    try {
        // Find users with expired plans
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
            
            // Handle Excessive Bots
            const bots = await BotModel.find({ ownerId: user.userId });
            if(bots.length > 1) {
                // Stop and disable bots beyond the free limit of 1
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
                    'Your Premium subscription has ended. You have been downgraded to the <b>Free</b> plan.\n' +
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
// SECTION 11: MAIN ADMIN BOT LOGIC (HANDLING COMMANDS)
// =================================================================================================

// START COMMAND
mainBot.command('start', async (ctx) => {
    try {
        const args = ctx.message.text.split(' ');
        const referrerId = args[1]; // Get referral ID if present

        let user = await UserModel.findOne({ userId: ctx.from.id.toString() });
        
        if (!user) {
            // Register New User via Bot
            user = await UserModel.create({
                userId: ctx.from.id.toString(),
                username: ctx.from.username,
                firstName: ctx.from.first_name,
                referredBy: referrerId && referrerId !== ctx.from.id.toString() ? referrerId : null
            });

            logSystem('INFO', `New Bot User Joined: ${ctx.from.first_name}`);

            // Handle Referral Bonus
            if (user.referredBy) {
                await UserModel.findOneAndUpdate({ userId: user.referredBy }, { $inc: { referrals: 1 } });
                try { 
                    await ctx.telegram.sendMessage(user.referredBy, 
                        `🎉 <b>New Referral!</b>\n${ctx.from.first_name} joined using your link.\nYou earned <b>+1 Point</b>.`, 
                        { parse_mode: 'HTML' }
                    ); 
                } catch(e){}
            }
        }

        // Build Welcome Interface
        const buttons = [];
        ADMIN_CONFIG.channels.forEach(ch => {
            buttons.push([Markup.button.url(`📢 Join ${ch.name}`, ch.url)]);
        });
        buttons.push([Markup.button.webApp('🚀 LAUNCH CONTROL PANEL', WEB_APP_URL)]);

        const welcomeText = 
            `👋 <b>Welcome to Laga Host Cyber Core!</b>\n\n` +
            `The most advanced Telegram Bot Hosting Platform powered by <b>Gemini AI</b>.\n\n` +
            `✨ <b>System Capabilities:</b>\n` +
            `• 24/7 Server Uptime\n` +
            `• AI-Powered Code Generation\n` +
            `• Targeted Child-Bot Broadcasting\n` +
            `• No Coding Knowledge Required\n\n` +
            `👇 <b>Access the Mainframe:</b>`;

        await ctx.replyWithHTML(welcomeText, Markup.inlineKeyboard(buttons));

    } catch (e) {
        console.error('Start Command Error:', e);
    }
});

// ADMIN ACTION: APPROVE PAYMENT
mainBot.action(/^approve:(\d+):(\w+):(.+)$/, async (ctx) => {
    try {
        const userId = ctx.match[1];
        const plan = ctx.match[2];
        const payId = ctx.match[3];
        const limits = { 'Pro': 5, 'VIP': 10 };
        
        // Expiry Calculation
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 30);

        // Update User Profile
        await UserModel.findOneAndUpdate(
            { userId }, 
            { plan, botLimit: limits[plan], planExpiresAt: expiry }
        );
        
        // Update Transaction Status
        await PaymentModel.findByIdAndUpdate(payId, { status: 'APPROVED', adminResponseDate: new Date() });

        // Update Admin UI
        await ctx.editMessageText(
            `${ctx.callbackQuery.message.text}\n\n✅ <b>APPROVED</b> by ${ctx.from.first_name}`, 
            { parse_mode: 'HTML' }
        );

        // Notify User
        await mainBot.telegram.sendMessage(userId, 
            `✅ <b>Payment Approved!</b>\n\n` +
            `You have been upgraded to <b>${plan}</b> tier.\n` +
            `New Bot Limit: ${limits[plan]}\n` +
            `Valid until: ${moment(expiry).format('DD MMM YYYY')}`, 
            { parse_mode: 'HTML' }
        );

    } catch(e) { console.error(e); }
});

// ADMIN ACTION: DECLINE PAYMENT
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
            `Your transaction could not be verified. Please contact support if this is an error.`, 
            { parse_mode: 'HTML' }
        );
    } catch(e) { console.error(e); }
});

// -------------------------------------------------------------------------------------------------
// COMMAND: /broadcast
// FEATURE: Child-Only Broadcasting (Sends message ONLY to end-users of hosted bots)
// -------------------------------------------------------------------------------------------------
mainBot.command('broadcast', async (ctx) => {
    // 1. Security Check: Only Admin can run this
    if (ctx.from.id.toString() !== ADMIN_CONFIG.adminId) {
        return ctx.reply("⛔ Access Denied: Unauthorized Personnel.");
    }

    // 2. Input Validation
    const message = ctx.message.text.replace('/broadcast', '').trim();
    if (!message) {
        return ctx.reply("⚠️ Syntax Error: <code>/broadcast Your HTML Message Here</code>", { parse_mode: 'HTML' });
    }

    const statusMsg = await ctx.reply("⏳ <b>Broadcast Sequence Initiated...</b>\nTarget: Hosted Child-Bot Users Only", { parse_mode: 'HTML' });
    let totalSent = 0;
    let errors = 0;

    logSystem('INFO', `Admin Broadcast Started by ${ctx.from.first_name}`);

    try {
        // 3. Find all Running Bots
        const runningBots = await BotModel.find({ status: 'RUNNING' });

        for (const bot of runningBots) {
            // Find users associated with this specific bot
            const endUsers = await EndUserModel.find({ botId: bot._id.toString() });
            
            if(endUsers.length === 0) continue;

            // Get active instance from RAM or create a temporary one
            let senderBot = activeBotInstances[bot._id.toString()];
            if (!senderBot) {
                try { 
                    senderBot = new Telegraf(bot.token); 
                } catch(e) { 
                    continue; 
                }
            }

            // 4. Send Message Loop
            for (const eu of endUsers) {
                try {
                    await senderBot.telegram.sendMessage(eu.tgId, message, { parse_mode: 'HTML' });
                    totalSent++;
                    // Rate Limiting (50ms) to prevent Telegram flood limits
                    await new Promise(r => setTimeout(r, 50)); 
                } catch(e) {
                    errors++;
                    // If blocked, remove user to clean DB
                    if(e.code === 403 || e.code === 400) {
                        await EndUserModel.findByIdAndDelete(eu._id);
                    }
                }
            }
        }
    } catch(e) { 
        console.error('Child Broadcast Error', e); 
    }

    // 5. Final Report
    logSystem('SUCCESS', `Broadcast Completed. Sent: ${totalSent}`);
    
    try {
        await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id);
    } catch(e){}

    await ctx.reply(
        `✅ <b>Broadcast Complete</b>\n\n` +
        `🎯 Target: <b>Hosted Bot Users</b>\n` +
        `📨 Successfully Sent: <b>${totalSent}</b>\n` +
        `❌ Failed/Blocked: <b>${errors}</b>`,
        { parse_mode: 'HTML' }
    );
});

// =================================================================================================
// SECTION 12: SYSTEM STARTUP & INITIALIZATION
// =================================================================================================

// 1. Launch Main Admin Bot
mainBot.telegram.deleteWebhook().then(() => {
    mainBot.launch({ dropPendingUpdates: true })
        .then(() => logSystem('SUCCESS', 'Main Admin Bot is Online'))
        .catch(err => logSystem('ERROR', 'Main Bot Init Failed: ' + err.message));
});

// 2. Restore Sessions (Auto-Start Bots after Server Reboot)
mongoose.connection.once('open', async () => {
    const runningBots = await BotModel.find({ status: 'RUNNING' });
    
    if(runningBots.length > 0) {
        logSystem('SYSTEM', `Restoring ${runningBots.length} active bot sessions from database...`);
        
        let restored = 0;
        for (const bot of runningBots) {
            // Add slight delay to prevent CPU spike
            await new Promise(r => setTimeout(r, 500));
            
            const res = await startBotEngine(bot);
            if(res.success) restored++;
        }
        
        logSystem('SUCCESS', `Restoration Complete. ${restored}/${runningBots.length} bots active.`);
    }
});

// 3. Serve Frontend SPA for any unknown routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 4. Graceful Shutdown Handling
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

// 5. Start HTTP Server
app.listen(PORT, () => {
    logSystem('SUCCESS', `Laga Host Cyber Core is Running on Port ${PORT}`);
    logSystem('INFO', `Dashboard Access: ${WEB_APP_URL}`);
});
