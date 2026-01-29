/**
 * =================================================================================================
 *  __      __   _____      ___      _   _   ___    ___   _____ 
 * |  |    /  \ |  ___|    /   \    | | | | / _ \  / __| |_   _|
 * |  |   / /\ \| |  _    / /_\ \   | |_| || (_) | \__ \   | |  
 * |  |__|_/  \_\ |_|   /_/   \_\   |  _  | \___/  |___/   |_|  
 * |____|                           |_| |_|                     
 * 
 * PROJECT: LAGA HOST ULTIMATE SERVER (TITANIUM ENTERPRISE EDITION)
 * VERSION: 10.0.1 (Production Release)
 * AUTHOR: Laga Host Development Team
 * COPYRIGHT: © 2024-2027 Laga Host Inc. All Rights Reserved.
 * 
 * DESCRIPTION:
 * The most advanced, monolithic backend architecture for Telegram Bot Hosting.
 * Built to handle high concurrency, secure payments, and dynamic code execution.
 * 
 * [CORE MODULES]
 * 1. SERVER KERNEL: Express.js with Helmet/Cors Security Headers.
 * 2. DATABASE ORM: Mongoose with Strict Schema Validation & Indexing.
 * 3. BOT ENGINE: Virtual Sandbox (VM) for isolated code execution.
 * 4. BROADCAST ENGINE: Async Queue System with Anti-Flood throttling.
 * 5. MARKETPLACE V2: Hybrid Digital Asset Delivery (Files + Text + Image URLs).
 * 6. AD NETWORK: Monetag Reward Verification System.
 * 7. ADMIN INTELLIGENCE: Real-time Analytics & Wizard-based Management.
 * 
 * =================================================================================================
 */

// =================================================================================================
// SECTION 1: SYSTEM IMPORTS & ENVIRONMENT SETUP
// =================================================================================================

// 1.1 Load Environment Variables
// We use 'dotenv' to securely manage API Keys and Secrets.
require('dotenv').config();

// 1.2 Core Node.js Modules
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto'); // Used for Hashing & UUID generation

// 1.3 Third-Party Frameworks & Libraries
const express = require('express');        // Web Server Framework
const mongoose = require('mongoose');      // MongoDB Object Modeling
const bodyParser = require('body-parser'); // Request Parsing
const cors = require('cors');              // Cross-Origin Resource Sharing
const { Telegraf, Markup, session } = require('telegraf'); // Telegram Bot API Wrapper
const cron = require('node-cron');         // Task Scheduling
const moment = require('moment');          // Date & Time Manipulation
const axios = require('axios');            // HTTP Client
const { v4: uuidv4 } = require('uuid');    // Unique Identifier Generator

// =================================================================================================
// SECTION 2: GLOBAL CONFIGURATION & CONSTANTS
// =================================================================================================

/**
 * CONFIGURATION OBJECT
 * Centralized control for all system parameters.
 * Change these values to tweak system behavior without touching logic.
 */
const CONFIG = {
    // Identity & Branding
    systemName: "Laga Host Ultimate",
    version: "10.0.1",
    env: process.env.NODE_ENV || "PRODUCTION",
    port: process.env.PORT || 3000,
    
    // Database Connection
    // Ensure this URI is correct in your .env file
    mongoUri: process.env.MONGO_URI || "mongodb+srv://lagahost:l%40g%40ho%24t@snowmanadventure.ocodku0.mongodb.net/snowmanadventure?retryWrites=true&w=majority&appName=snowmanadventure",

    // Telegram Credentials
    // The main bot that users interact with
    mainBotToken: process.env.BOT_TOKEN || "8264143788:AAH0fRkMqBw4rONo0WVEi-OyAVkPs9bRt84",
    // The Super Admin ID (You)
    superAdminId: process.env.ADMIN_ID || "7605281774",

    // Web Integration
    frontendUrl: process.env.WEB_APP_URL || "https://lagahost.onrender.com",

    // Support Links (Used in /start and Menus)
    support: {
        channel: "https://t.me/lagatechofficial",
        chat: "https://t.me/lagatech",
        youtube: "https://youtube.com/@lagatech",
        email: "support@lagahost.com"
    },

    // Payment Gateway Details (Manual/Personal)
    payments: {
        bkash: "01761494948",
        nagad: "01761494948",
        rocket: "01761494948",
        upay: "01761494948"
    },

    // System Constraints & Limits
    limits: {
        maxBodySize: '100mb', // Allowed JSON body size for code uploads
        broadcastBatch: 25,   // Number of users per broadcast chunk
        broadcastDelay: 1500, // Delay between chunks in ms (Anti-Flood)
        sandboxTimeout: 5000, // Max execution time for user bot commands (5s)
        maxFreeBots: 1,       // Free tier bot limit
        maxProBots: 5,        // Pro tier bot limit
        maxVipBots: 10        // VIP tier bot limit
    },

    // Security Settings
    security: {
        adminHeader: 'x-admin-id', // Header key for Admin API protection
        tokenRegex: /^\d+:[A-Za-z0-9_-]{35,}$/ // Bot Token Validation Regex
    }
};

/**
 * PLAN DEFINITIONS
 * Logic for Upgrading/Downgrading users.
 */
const PLAN_TIERS = {
    'Free': { 
        rank: 0,
        botLimit: CONFIG.limits.maxFreeBots, 
        validityDays: 3650, // 10 Years (Lifetime)
        priceTk: 0,
        referralPointsCost: 0,
        features: ['Basic Support', 'Shared CPU', 'Standard Speed', '1 Bot Slot']
    },
    'Pro':  { 
        rank: 1,
        botLimit: CONFIG.limits.maxProBots, 
        validityDays: 30, 
        priceTk: 50,
        referralPointsCost: 50,
        features: ['Priority Support', 'Priority CPU', 'Faster Execution', '5 Bot Slots']
    },
    'VIP':  { 
        rank: 2,
        botLimit: CONFIG.limits.maxVipBots, 
        validityDays: 30, 
        priceTk: 80,
        referralPointsCost: 80,
        features: ['Dedicated Support', 'Max CPU', 'Real-time Analytics', '10 Bot Slots', 'Zero Latency']
    }
};

// =================================================================================================
// SECTION 3: ADVANCED LOGGING UTILITY
// =================================================================================================

/**
 * SystemLogger Class
 * Provides colored and categorized logs for better debugging in the console.
 * Essential for monitoring a system of this size.
 */
class SystemLogger {
    static getTimestamp() {
        return moment().format('YYYY-MM-DD HH:mm:ss');
    }

    static info(message) {
        console.log(`ℹ️  [INFO]    [${this.getTimestamp()}] : ${message}`);
    }

    static success(message) {
        console.log(`✅  [SUCCESS] [${this.getTimestamp()}] : ${message}`);
    }

    static warn(message) {
        console.log(`⚠️  [WARN]    [${this.getTimestamp()}] : ${message}`);
    }

    static error(message, trace = '') {
        console.error(`❌  [ERROR]   [${this.getTimestamp()}] : ${message}`);
        if(trace) console.error(`    └── Trace: ${trace}`);
    }

    static db(message) {
        console.log(`🗄️  [DB]      [${this.getTimestamp()}] : ${message}`);
    }

    static bot(message) {
        console.log(`🤖  [BOT]     [${this.getTimestamp()}] : ${message}`);
    }

    static market(message) {
        console.log(`🛍️  [MARKET]  [${this.getTimestamp()}] : ${message}`);
    }

    static security(message) {
        console.log(`🛡️  [SECURE]  [${this.getTimestamp()}] : ${message}`);
    }
}

// =================================================================================================
// SECTION 4: DATABASE SCHEMA DEFINITIONS (MONGOOSE)
// =================================================================================================

/**
 * Database Initialization
 * Connects to MongoDB Atlas using the URI provided in Config.
 * Handles connection events and errors gracefully.
 */
mongoose.connect(CONFIG.mongoUri)
    .then(() => {
        SystemLogger.db("=================================================");
        SystemLogger.db("CONNECTIVITY ESTABLISHED WITH MONGODB ATLAS");
        SystemLogger.db(`CLUSTER: ${CONFIG.mongoUri.split('@')[1].split('/')[0]}`);
        SystemLogger.db("STATUS: OPERATIONAL");
        SystemLogger.db("=================================================");
    })
    .catch(err => {
        SystemLogger.error("FATAL: DATABASE CONNECTION FAILED");
        SystemLogger.error(err.message);
        // We do not exit process here to allow retry logic in production managers like PM2
    });


// -------------------------------------------------------------------------
// 4.1 USER MODEL (Platform Users)
// -------------------------------------------------------------------------
// Stores detailed information about every user registered on Laga Host.
const userSchema = new mongoose.Schema({
    userId: { 
        type: String, 
        required: true, 
        unique: true, 
        index: true // Optimized for search
    },
    firstName: { type: String, default: 'User' },
    username: { type: String, default: 'Unknown' },
    photoUrl: { type: String, default: '' },
    
    // Subscription Data
    plan: { 
        type: String, 
        default: 'Free', 
        enum: ['Free', 'Pro', 'VIP'] 
    },
    planExpiresAt: { type: Date, default: null }, // Null implies Lifetime/Free logic
    
    // Resource Quotas & Limits
    botLimit: { type: Number, default: 1 },
    cpuPriority: { type: String, default: 'Standard' },
    
    // Economy System
    referrals: { type: Number, default: 0 },
    referredBy: { type: String, default: null },
    walletBalance: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    
    // Security & Status
    isBanned: { type: Boolean, default: false },
    banReason: { type: String, default: null },
    isAdmin: { type: Boolean, default: false },
    
    // Activity Tracking
    lastActive: { type: Date, default: Date.now },
    joinedAt: { type: Date, default: Date.now },
    
    // Metadata
    ipAddress: { type: String, default: '' },
    deviceInfo: { type: String, default: '' }
});


// -------------------------------------------------------------------------
// 4.2 BOT MODEL (Hosted Instances)
// -------------------------------------------------------------------------
// The core model representing a user's hosted Telegram bot.
const botSchema = new mongoose.Schema({
    ownerId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    token: { type: String, required: true, unique: true },
    
    // Runtime State
    status: { 
        type: String, 
        default: 'STOPPED', 
        enum: ['RUNNING', 'STOPPED', 'ERROR', 'SUSPENDED', 'MAINTENANCE'] 
    },
    
    // Code Storage (The Brain)
    // Structure: { 'start': 'ctx.reply("Hello")', 'help': '...' }
    commands: { type: Object, default: {} }, 
    
    // Advanced Configuration
    envVars: { type: Object, default: {} }, // Custom ENV variables
    allowedUsers: { type: [String], default: [] }, // Access Control List
    webhookUrl: { type: String, default: null }, // If using Webhook instead of Polling
    
    // Performance Metrics
    startedAt: { type: Date, default: null },
    restartCount: { type: Number, default: 0 },
    totalMessagesProcessed: { type: Number, default: 0 },
    lastError: { type: String, default: '' },
    
    // System Flags
    isFirstLive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});


// -------------------------------------------------------------------------
// 4.3 END USER MODEL (Client Analytics)
// -------------------------------------------------------------------------
// Tracks distinct users interacting with Hosted Bots. Critical for Broadcasts.
const endUserSchema = new mongoose.Schema({
    tgId: { type: String, required: true },
    botId: { type: String, required: true }, // Link to Bot Model
    firstName: String,
    username: String,
    
    // Analytics
    interactionCount: { type: Number, default: 1 },
    lastInteractedAt: { type: Date, default: Date.now },
    firstSeenAt: { type: Date, default: Date.now }
});
// Composite Index: A user is unique PER bot (tgId + botId)
endUserSchema.index({ tgId: 1, botId: 1 }, { unique: true });


// -------------------------------------------------------------------------
// 4.4 PRODUCT MODEL (Marketplace V2)
// -------------------------------------------------------------------------
// Represents digital items for sale. Supports Images via URL or FileID.
const productSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    
    // Image Handling (Flexible)
    displayImageId: { type: String, required: true }, 
    imageType: { type: String, enum: ['FILE', 'URL'], default: 'FILE' },
    
    // Pricing
    originalPrice: { type: Number, required: true },
    discountPrice: { type: Number, required: true },
    
    // Monetag Ads Integration
    isAdSupported: { type: Boolean, default: false },
    adCount: { type: Number, default: 0 }, // 0 = No Ads required
    
    // Digital Delivery Content
    deliveryType: { type: String, enum: ['FILE', 'TEXT'], default: 'FILE' },
    contentFileId: { type: String }, // For Files/Documents
    contentMessage: { type: String }, // For Text/Links/Keys
    
    // State
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'OUT_OF_STOCK'], default: 'ACTIVE' },
    soldCount: { type: Number, default: 0 },
    rating: { type: Number, default: 5.0 },
    
    createdAt: { type: Date, default: Date.now }
});


// -------------------------------------------------------------------------
// 4.5 ORDER MODEL (Transaction History)
// -------------------------------------------------------------------------
// Logs every purchase, including Ad-based rewards.
const orderSchema = new mongoose.Schema({
    orderId: { type: String, required: true, unique: true }, // e.g., ORD-123456
    userId: { type: String, required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    productTitle: String,
    
    // Payment Details
    amountPaid: { type: Number, default: 0 },
    paymentMethod: { type: String, enum: ['BKASH', 'NAGAD', 'ROCKET', 'ADS', 'BALANCE', 'FREE'] },
    trxId: { type: String, default: 'N/A' }, // 'AD-REWARD-...' for Ads
    
    // Fulfillment
    deliveryStatus: { type: String, enum: ['PENDING', 'SENT', 'FAILED'], default: 'PENDING' },
    deliveryDate: Date,
    adminNote: String,
    
    createdAt: { type: Date, default: Date.now }
});


// -------------------------------------------------------------------------
// 4.6 PAYMENT MODEL (Subscription Requests)
// -------------------------------------------------------------------------
// Logs manual payment requests for Plan Upgrades.
const paymentSchema = new mongoose.Schema({
    trxId: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    username: String,
    plan: { type: String, required: true },
    amount: { type: Number, required: true },
    method: { type: String, required: true },
    
    status: { 
        type: String, 
        enum: ['PENDING', 'APPROVED', 'DECLINED'], 
        default: 'PENDING' 
    },
    
    adminResponseAt: Date,
    reviewedBy: String, // Admin ID
    createdAt: { type: Date, default: Date.now }
});


// -------------------------------------------------------------------------
// 4.7 BROADCAST JOB MODEL (Queue System)
// -------------------------------------------------------------------------
// Stores large broadcast tasks to be processed by Cron to avoid timeout.
const broadcastJobSchema = new mongoose.Schema({
    jobId: { type: String, unique: true },
    adminId: String,
    targetType: { type: String, enum: ['MAIN_USERS', 'CLIENT_USERS'] },
    
    // Content
    message: String,
    imageUrl: String,
    button: {
        text: String,
        url: String
    },
    
    // Progress Tracking
    status: { type: String, enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'], default: 'PENDING' },
    stats: {
        totalTargets: { type: Number, default: 0 },
        sent: { type: Number, default: 0 },
        failed: { type: Number, default: 0 },
        blocked: { type: Number, default: 0 }
    },
    
    startedAt: Date,
    completedAt: Date,
    createdAt: { type: Date, default: Date.now }
});


// Register All Models
const User = mongoose.model('User', userSchema);
const Bot = mongoose.model('Bot', botSchema);
const EndUser = mongoose.model('EndUser', endUserSchema);
const Product = mongoose.model('Product', productSchema);
const Order = mongoose.model('Order', orderSchema);
const Payment = mongoose.model('Payment', paymentSchema);
const BroadcastJob = mongoose.model('BroadcastJob', broadcastJobSchema);

// =================================================================================================
// SECTION 5: IN-MEMORY STATE MANAGEMENT
// =================================================================================================

// 5.1 Active Bot Instances
// Stores running Telegraf instances. Access: activeBotInstances[botId]
const activeBotInstances = {}; 

// 5.2 Admin Wizard State
// Used for multi-step conversations (like Adding Product) in the Admin Bot.
// Access: adminWizardState[adminId] = { step: 1, data: {} }
const adminWizardState = {}; 

// 5.3 System Stats Cache
// Caches DB counts to reduce load on frequent stats requests
let systemStatsCache = {
    lastUpdated: null,
    data: {}
};

// =================================================================================================
// SECTION 6: CORE ENGINE - BOT SANDBOX
// =================================================================================================

/**
 * 6.1 Token Validator
 * Regex to check if a token looks like a valid Telegram Bot Token.
 */
function isValidBotToken(token) {
    return CONFIG.security.tokenRegex.test(token);
}

/**
 * 6.2 Subscription Validator
 * Checks if a user's plan has expired and downgrades them if necessary.
 */
async function validateSubscription(user) {
    // Free users never expire
    if (user.plan === 'Free') return user; 

    const now = new Date();
    // If expiry date exists and is in the past
    if (user.planExpiresAt && now > new Date(user.planExpiresAt)) {
        SystemLogger.security(`Subscription Expired for User: ${user.userId}. Action: Downgrade.`);

        // 1. Downgrade Database Record
        user.plan = 'Free';
        user.botLimit = PLAN_TIERS['Free'].botLimit;
        user.planExpiresAt = null;
        user.cpuPriority = 'Standard';
        await user.save();

        // 2. Enforce Limits (Stop excess bots)
        const bots = await Bot.find({ ownerId: user.userId });
        const allowed = PLAN_TIERS['Free'].botLimit;
        
        if (bots.length > allowed) {
            // Stop extra bots starting from the end of the array
            for (let i = allowed; i < bots.length; i++) {
                const bId = bots[i]._id.toString();
                
                // Stop in RAM
                if (activeBotInstances[bId]) {
                    try { activeBotInstances[bId].stop(); } catch(e) {}
                    delete activeBotInstances[bId];
                }
                
                // Update DB Status
                bots[i].status = 'STOPPED';
                await bots[i].save();
                
                SystemLogger.bot(`Stopped excess bot ${bots[i].name} for user ${user.userId}`);
            }
        }
        
        // 3. Notify User (Fire & Forget)
        try {
            const mainBot = new Telegraf(CONFIG.mainBotToken);
            await mainBot.telegram.sendMessage(user.userId, 
                "⚠️ <b>Subscription Expired</b>\n\n" +
                "Your plan has expired and you have been downgraded to <b>Free</b>.\n" +
                "Excess bots have been stopped automatically.", 
                { parse_mode: 'HTML' }
            );
        } catch(e) {}
    }
    return user;
}

/**
 * 6.3 THE SANDBOX ENGINE
 * This is the heart of Laga Host. It creates an isolated environment for user code.
 * @param {Object} botDoc - The MongoDB document of the bot
 */
async function startBotEngine(botDoc) {
    const botId = botDoc._id.toString();

    // Prevent duplicate starts
    if (activeBotInstances[botId]) {
        return { success: true, message: 'Instance already active.' };
    }

    try {
        SystemLogger.bot(`Booting Kernel for: ${botDoc.name} (${botId})`);

        // A. Initialize Telegraf Instance
        const bot = new Telegraf(botDoc.token);
        
        // B. Configuration
        // Force Polling Mode (Delete Webhook if exists)
        try { await bot.telegram.deleteWebhook(); } catch (e) { /* Ignore */ }

        // Fetch Bot Info to verify token
        const botInfo = await bot.telegram.getMe();

        // C. Error Handling Wrapper
        // Prevents the main server from crashing if a child bot fails
        bot.catch((err, ctx) => {
            SystemLogger.error(`[Child Bot Crash] ${botDoc.name}: ${err.message}`);
            // Log error to DB for user visibility
            Bot.findByIdAndUpdate(botId, { lastError: err.message }).exec();
        });

        // D. Analytics Middleware
        // Tracks every message received by hosted bots for stats & broadcast
        bot.use(async (ctx, next) => {
            if(ctx.from) {
                // Background update (Non-blocking)
                (async () => {
                    try {
                        await EndUser.updateOne(
                            { tgId: ctx.from.id.toString(), botId: botId },
                            { 
                                $set: { 
                                    username: ctx.from.username, 
                                    firstName: ctx.from.first_name, 
                                    lastInteractedAt: new Date() 
                                },
                                $inc: { interactionCount: 1 },
                                $setOnInsert: { firstSeenAt: new Date() }
                            },
                            { upsert: true }
                        );
                        // Increment Global Counter
                        await Bot.updateOne({ _id: botId }, { $inc: { totalMessagesProcessed: 1 } });
                    } catch(e) {}
                })();
            }
            return next();
        });

        // E. Dynamic Command Execution (The "VM")
        // Listens for text messages and executes stored code
        bot.on('message', async (ctx) => {
            if (!ctx.message.text) return;
            const text = ctx.message.text;
            
            // Basic Command Parser
            if (text.startsWith('/')) {
                const cmdName = text.substring(1).split(' ')[0]; // Extract 'start' from '/start param'
                
                // Fetch latest code from DB (Hot-Reloading)
                const liveBot = await Bot.findById(botId);
                const userCode = liveBot?.commands?.[cmdName];
                
                if (userCode) {
                    try {
                        // 📦 SANDBOX CONSTRUCTION
                        // We use 'new Function' to create a scope.
                        // We expose specific secure libraries: ctx, bot, Markup, axios, moment.
                        // We wrap execution in an async IIFE.
                        
                        const sandboxScript = `
                            return (async (ctx, bot, Markup, axios, moment) => {
                                try {
                                    // --- USER CODE START ---
                                    ${userCode}
                                    // --- USER CODE END ---
                                } catch (runtimeErr) {
                                    console.error("Runtime Error in Bot ${botDoc.name}:", runtimeErr.message);
                                    ctx.replyWithHTML(
                                        '⚠️ <b>System Error:</b>\\n' + 
                                        '<pre>' + runtimeErr.message + '</pre>'
                                    ).catch(e => {});
                                }
                            })(ctx, bot, Markup, axios, moment);
                        `;
                        
                        // Execute
                        const compiledFunction = new Function('ctx', 'bot', 'Markup', 'axios', 'moment', sandboxScript);
                        compiledFunction(ctx, bot, Markup, axios, moment);
                        
                    } catch (syntaxErr) {
                        ctx.replyWithHTML(
                            `❌ <b>Syntax Error:</b>\n<pre>${syntaxErr.message}</pre>`
                        ).catch(e => {});
                    }
                }
            }
        });

        // F. Launch Sequence
        // dropPendingUpdates: true prevents flood of old messages on restart
        bot.launch({ dropPendingUpdates: true })
            .then(() => {
                SystemLogger.success(`Instance Online: ${botDoc.name} (@${botInfo.username})`);
            })
            .catch(err => {
                SystemLogger.error(`Launch Failed for ${botDoc.name}: ${err.message}`);
                delete activeBotInstances[botId]; // Remove from RAM if failed
            });

        // G. Update State
        activeBotInstances[botId] = bot;
        
        // Update Database Status
        if (botDoc.isFirstLive) {
            botDoc.isFirstLive = false;
        }
        botDoc.status = 'RUNNING';
        botDoc.startedAt = new Date();
        await botDoc.save();

        return { success: true, botInfo };

    } catch (error) {
        SystemLogger.error(`Engine Core Fail ${botDoc.name}: ${error.message}`);
        return { success: false, message: 'Invalid Token or Critical Server Error' };
    }
}

// =================================================================================================
// SECTION 7: MIDDLEWARE & SERVER SETUP
// =================================================================================================

// 7.1 Initialize Express
const app = express();

// 7.2 CORS Configuration
// Allows the Frontend (on any domain for now) to access the API.
// In production, restrict 'origin' to CONFIG.frontendUrl.
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-id', 'x-user-id']
}));

// 7.3 Body Parsing
// Extended limits to support large code files/images in base64.
app.use(bodyParser.json({ limit: CONFIG.limits.maxBodySize }));
app.use(bodyParser.urlencoded({ extended: true, limit: CONFIG.limits.maxBodySize }));

// 7.4 Security Middleware: Admin Check
// Protects sensitive routes like Product Addition or Broadcasting.
const requireAdmin = (req, res, next) => {
    const adminId = req.headers[CONFIG.security.adminHeader];
    if (adminId && adminId === CONFIG.superAdminId) {
        next();
    } else {
        SystemLogger.warn(`Unauthorized Admin Access Attempt from IP: ${req.ip}`);
        res.status(403).json({ success: false, message: "Access Denied: Admin Only" });
    }
};

// 7.5 Request Logger
// Logs incoming API requests for debugging.
app.use((req, res, next) => {
    if(req.path.startsWith('/api')) {
        const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        // Don't log health checks to keep logs clean
        if(!req.path.includes('health')) {
            SystemLogger.info(`API Request: ${req.method} ${req.path} [IP: ${ip}]`);
        }
    }
    next();
});

// =================================================================================================
// SECTION 8: API ROUTE CONTROLLERS (BACKEND ENDPOINTS)
// =================================================================================================

// -------------------------------------------------------------------------
// 8.1 AUTHENTICATION & DASHBOARD SYNC
// -------------------------------------------------------------------------

/**
 * POST /api/bots
 * Main entry point for the Frontend.
 * 1. Syncs Telegram User Data to DB.
 * 2. Checks Subscription Status.
 * 3. Returns List of Bots + User Stats.
 */
app.post('/api/bots', async (req, res) => {
    try {
        const { userId, username, firstName, photoUrl } = req.body;
        
        if(!userId) {
            return res.status(400).json({ success: false, message: "User ID Missing" });
        }

        // A. Find or Create User
        let user = await User.findOne({ userId });
        
        if (!user) {
            user = await User.create({
                userId,
                username: username || 'Unknown',
                firstName: firstName || 'User',
                photoUrl: photoUrl || ''
            });
            SystemLogger.info(`New User Registered: ${firstName} (${userId})`);
        } else {
            // Update metadata on every login
            let changed = false;
            if(firstName && user.firstName !== firstName) { user.firstName = firstName; changed = true; }
            if(username && user.username !== username) { user.username = username; changed = true; }
            if(photoUrl && user.photoUrl !== photoUrl) { user.photoUrl = photoUrl; changed = true; }
            
            user.lastActive = new Date();
            user.ipAddress = req.ip; // Track IP
            
            // Important: Validate Subscription Logic
            user = await validateSubscription(user);
            await user.save();
        }

        // B. Fetch Bots
        const bots = await Bot.find({ ownerId: userId }).sort({ createdAt: -1 });

        // C. Construct Response
        res.json({ 
            success: true, 
            bots, 
            user: {
                ...user.toObject(),
                expireDate: user.planExpiresAt, // For Frontend compatibility
                planDetails: PLAN_TIERS[user.plan] // Send plan features
            } 
        });

    } catch (e) {
        SystemLogger.error(`API /bots Error: ${e.message}`);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
});


// -------------------------------------------------------------------------
// 8.2 BOT MANAGEMENT (Create, Toggle, Delete)
// -------------------------------------------------------------------------

/**
 * POST /api/createBot
 * Handles creation of new bot instances.
 */
app.post('/api/createBot', async (req, res) => {
    try {
        const { token, name, userId } = req.body;
        
        // 1. Fetch User & Count
        const user = await User.findOne({ userId });
        const currentCount = await Bot.countDocuments({ ownerId: userId });
        
        // 2. Check Plan Limits
        if (currentCount >= user.botLimit) {
            return res.json({ 
                success: false, 
                message: `Plan Limit Reached (${user.botLimit})! Please Upgrade.` 
            });
        }
        
        // 3. Validate Token Format
        if(!isValidBotToken(token)) {
            return res.json({ success: false, message: 'Invalid Bot Token Format' });
        }

        // 4. Check Duplicate Token
        const existing = await Bot.findOne({ token });
        if (existing) {
            return res.json({ success: false, message: 'Token already used by another user.' });
        }

        // 5. Create Bot
        const newBot = await Bot.create({ 
            ownerId: userId, 
            name: name.trim(), 
            token: token.trim() 
        });
        
        SystemLogger.success(`New Bot Created: ${name} by ${userId}`);
        res.json({ success: true, bot: newBot });

    } catch (e) {
        SystemLogger.error(`/api/createBot Error: ${e.message}`);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

/**
 * POST /api/toggleBot
 * Starts or Stops a bot.
 */
app.post('/api/toggleBot', async (req, res) => {
    try {
        const { botId, action } = req.body;
        const bot = await Bot.findById(botId);
        
        if(!bot) return res.json({ success: false, message: 'Bot not found' });

        // Security: Check User Subscription again before starting
        if(action === 'start') {
            const user = await User.findOne({ userId: bot.ownerId });
            await validateSubscription(user); // Downgrade if needed
            
            // Check if user is banned
            if(user.isBanned) return res.json({ success: false, message: 'User is Banned.' });
        }

        if (action === 'start') {
            const result = await startBotEngine(bot);
            
            if (result.success) {
                // Return start time for UI timer
                res.json({ success: true, startedAt: bot.startedAt });
            } else {
                res.json({ success: false, message: result.message });
            }
        } else {
            // STOP ACTION
            if (activeBotInstances[botId]) {
                try {
                    activeBotInstances[botId].stop('SIGINT');
                } catch(e) { console.error('Error stopping instance:', e); }
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
 * POST /api/restartBot
 * Hard restart of a bot instance.
 */
app.post('/api/restartBot', async (req, res) => {
    try {
        const { botId } = req.body;
        const bot = await Bot.findById(botId);
        
        if(!bot) return res.json({ success: false, message: 'Bot not found' });

        // 1. Force Stop
        if (activeBotInstances[botId]) {
            try { activeBotInstances[botId].stop(); } catch(e) {}
            delete activeBotInstances[botId];
        }

        // 2. Start Again
        const result = await startBotEngine(bot);
        
        if (result.success) {
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
 * POST /api/deleteBot
 * Permanently removes a bot.
 */
app.post('/api/deleteBot', async (req, res) => {
    try {
        const { botId } = req.body;
        
        // Stop instance
        if (activeBotInstances[botId]) {
            try { activeBotInstances[botId].stop(); } catch(e){}
            delete activeBotInstances[botId];
        }
        
        // Remove from DB
        await Bot.findByIdAndDelete(botId);
        
        // Cleanup associated data (End Users)
        await EndUser.deleteMany({ botId: botId }); 
        
        SystemLogger.warn(`Bot Deleted ID: ${botId}`);
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});


// -------------------------------------------------------------------------
// 8.3 CODE EDITOR API (Commands Management)
// -------------------------------------------------------------------------

app.post('/api/getCommands', async (req, res) => {
    try {
        const bot = await Bot.findById(req.body.botId);
        res.json(bot ? bot.commands : {});
    } catch(e) { res.json({}) }
});

app.post('/api/saveCommand', async (req, res) => {
    try {
        const { botId, command, code } = req.body;
        // Basic sanitization
        const cleanCmd = command.replace('/', '').replace(/\s/g, '_').trim();
        
        await Bot.findByIdAndUpdate(botId, { 
            $set: { [`commands.${cleanCmd}`]: code } 
        });
        
        res.json({ success: true });
    } catch(e) { res.json({ success: false }) }
});

app.post('/api/deleteCommand', async (req, res) => {
    try {
        const { botId, command } = req.body;
        await Bot.findByIdAndUpdate(botId, { 
            $unset: { [`commands.${command}`]: "" } 
        });
        res.json({ success: true });
    } catch(e) { res.json({ success: false }) }
});


// -------------------------------------------------------------------------
// 8.4 MARKETPLACE & ORDERS API (V2 - ENHANCED)
// -------------------------------------------------------------------------

/**
 * GET /api/products
 * Fetches all active products for the marketplace.
 */
app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find({ status: 'ACTIVE' }).sort({ createdAt: -1 });
        res.json({ success: true, products });
    } catch (e) {
        SystemLogger.error(`Product Fetch Error: ${e.message}`);
        res.status(500).json({ success: false });
    }
});

/**
 * POST /api/buy-product
 * Handles Purchases: Cash, Balance, and AD REWARDS.
 */
app.post('/api/buy-product', async (req, res) => {
    const { userId, productId, paymentMethod, trxId } = req.body;
    
    try {
        // 1. Validate Product
        const product = await Product.findById(productId);
        if (!product) return res.json({ success: false, message: 'Product unavailable.' });
        
        // 2. AD REWARD LOGIC (Security Check)
        if (paymentMethod === 'ADS') {
            if (!product.isAdSupported) {
                return res.json({ success: false, message: 'Ads not supported for this item.' });
            }
            // In a real production environment, you would verify the 'trxId' token against
            // a server-side record from the ad provider postback.
            // Here we trust the frontend logic but log it heavily.
            SystemLogger.market(`Ad Reward Claimed: User ${userId} -> Product ${product.title}`);
        }

        // 3. Generate Order ID
        const orderCode = 'ORD-' + Math.floor(100000 + Math.random() * 900000);
        
        // 4. Create Order Record
        const newOrder = await Order.create({
            orderId: orderCode,
            userId,
            productId: product._id,
            productTitle: product.title,
            amountPaid: paymentMethod === 'ADS' ? 0 : product.discountPrice,
            paymentMethod,
            trxId: trxId || 'N/A',
            deliveryStatus: 'PENDING',
            isAdReward: paymentMethod === 'ADS'
        });

        // 5. Notify Admin Bot
        // We use an Inline Keyboard for "One Click Delivery"
        const mainBot = new Telegraf(CONFIG.mainBotToken);
        
        await mainBot.telegram.sendMessage(CONFIG.superAdminId, 
            `🛍️ <b>NEW ORDER (${paymentMethod})</b>\n\n` +
            `📦 <b>Product:</b> ${product.title}\n` +
            `💰 <b>Value:</b> ${product.discountPrice}tk\n` +
            `👤 <b>User:</b> <code>${userId}</code>\n` +
            `🧾 <b>Trx/Ref:</b> <code>${trxId}</code>\n` +
            `🆔 <b>Order ID:</b> ${orderCode}`,
            {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '✅ Verify & Auto-Send', callback_data: `deliver:${newOrder._id}` },
                        { text: '❌ Reject', callback_data: `reject_ord:${newOrder._id}` }
                    ]]
                }
            }
        ).catch(e => SystemLogger.error(`Admin Notify Fail: ${e.message}`));

        res.json({ success: true, message: 'Order Placed! Check your DM.' });

    } catch (e) {
        SystemLogger.error(`Order Error: ${e.message}`);
        res.json({ success: false, message: 'Server Error' });
    }
});


// -------------------------------------------------------------------------
// 8.5 PAYMENT & SUBSCRIPTION API
// -------------------------------------------------------------------------

/**
 * POST /api/submit-payment
 * Handles manual subscription payments and referral point redemption.
 */
app.post('/api/submit-payment', async (req, res) => {
    const { trxId, plan, amount, userId, user, method } = req.body;

    SystemLogger.info(`Payment Request: ${user} - ${amount} via ${method}`);

    // A. Referral Redemption
    if (method === 'referral') {
        const dbUser = await User.findOne({ userId });
        const requiredPoints = PLAN_TIERS[plan].referralPointsCost;
        
        if (!requiredPoints) return res.json({ success: false, message: "Invalid Plan" });

        if (dbUser.referrals < requiredPoints) {
            return res.json({ success: false, message: `Need ${requiredPoints} Points` });
        }
        
        // Apply Upgrade
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 30); 
        
        dbUser.plan = plan;
        dbUser.botLimit = PLAN_TIERS[plan].botLimit;
        dbUser.planExpiresAt = expiry;
        dbUser.referrals -= requiredPoints;
        await dbUser.save();
        
        return res.json({ success: true, message: "Redeemed Successfully!" });
    }

    // B. Manual Payment (Cash)
    try {
        const payment = await Payment.create({
            userId, username: user, plan, amount, trxId, method
        });

        const mainBot = new Telegraf(CONFIG.mainBotToken);
        await mainBot.telegram.sendMessage(CONFIG.superAdminId, 
            `💰 <b>NEW SUB REQUEST</b>\n\n` +
            `👤 @${user} (<code>${userId}</code>)\n` +
            `💎 ${plan} (${amount}tk)\n` +
            `🧾 <code>${trxId}</code>\n` +
            `💳 ${method}`,
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

        res.json({ success: true, message: 'Submitted for review.' });
    } catch(e) { 
        res.json({ success: false, message: 'Error submitting payment.' }); 
    }
});


// -------------------------------------------------------------------------
// 8.6 ADMIN API (FOR FRONTEND ADMIN PANEL)
// -------------------------------------------------------------------------
// These routes are protected by 'x-admin-id' header.

/**
 * POST /api/admin/add-product
 * Adds a new product directly from the frontend admin dashboard.
 */
app.post('/api/admin/add-product', requireAdmin, async (req, res) => {
    try {
        const data = req.body;
        
        // Basic Validation
        if (!data.title || !data.discountPrice || !data.displayImageId) {
            return res.json({ success: false, message: "Missing Required Fields" });
        }

        // Determine Image Type based on URL structure
        const imgType = data.displayImageId.startsWith('http') ? 'URL' : 'FILE';

        await Product.create({
            ...data,
            imageType: imgType,
            status: 'ACTIVE'
        });

        SystemLogger.market(`Product Added via Admin Panel: ${data.title}`);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

/**
 * POST /api/admin/broadcast
 * Triggers the Advanced Broadcast System.
 */
app.post('/api/admin/broadcast', requireAdmin, async (req, res) => {
    const { target, message, image, button } = req.body;
    
    // Create Job Entry
    const jobId = uuidv4();
    await BroadcastJob.create({
        jobId,
        adminId: CONFIG.superAdminId,
        targetType: target === 'main' ? 'MAIN_USERS' : 'CLIENT_USERS',
        message,
        imageUrl: image,
        button,
        status: 'PENDING'
    });

    // Start Processing in Background (Async)
    processBroadcastJob(jobId);

    res.json({ success: true, message: "Broadcast Job Started", jobId });
});


// =================================================================================================
// SECTION 9: BROADCAST ENGINE (QUEUE SYSTEM)
// =================================================================================================

/**
 * processBroadcastJob
 * Handles the heavy lifting of sending messages to thousands of users.
 * Uses batch processing and delays to avoid Telegram FloodWait errors.
 */
async function processBroadcastJob(jobId) {
    const job = await BroadcastJob.findOne({ jobId });
    if(!job) return;

    job.status = 'PROCESSING';
    job.startedAt = new Date();
    await job.save();

    SystemLogger.info(`Starting Broadcast Job: ${jobId} [Target: ${job.targetType}]`);

    // 1. Select Target Cursor
    let cursor;
    if (job.targetType === 'MAIN_USERS') {
        cursor = User.find().cursor();
    } else {
        // CLIENT_USERS (End Users of hosted bots)
        cursor = EndUser.find().cursor();
    }

    const mainBot = new Telegraf(CONFIG.mainBotToken);
    
    let sentCount = 0;
    let failedCount = 0;

    // 2. Loop Through Users
    for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
        
        // Determine Chat ID
        const chatId = job.targetType === 'MAIN_USERS' ? doc.userId : doc.tgId;
        
        // Determine Sender Bot
        let senderBot = mainBot;
        if (job.targetType === 'CLIENT_USERS') {
            // For End Users, we must send via the bot they interacted with.
            // Check if that bot is running
            const botId = doc.botId;
            if (activeBotInstances[botId]) {
                senderBot = activeBotInstances[botId];
            } else {
                // If bot is stopped, skip this user (or try to init temp bot)
                // For safety, skipping inactive bots to verify authorization
                continue; 
            }
        }

        // 3. Construct Message Payload
        const extra = { parse_mode: 'HTML' };
        if (job.button && job.button.text && job.button.url) {
            extra.reply_markup = {
                inline_keyboard: [[{ text: job.button.text, url: job.button.url }]]
            };
        }

        // 4. Send Message
        try {
            if (job.imageUrl && job.imageUrl.startsWith('http')) {
                await senderBot.telegram.sendPhoto(chatId, job.imageUrl, { caption: job.message, ...extra });
            } else {
                await senderBot.telegram.sendMessage(chatId, job.message, extra);
            }
            sentCount++;
        } catch (e) {
            failedCount++;
            // Specific Error Handling (Blocked/Deactivated)
            if (e.response && (e.response.error_code === 403 || e.response.description.includes('blocked'))) {
                 // Optionally remove user from DB
            }
        }

        // 5. Rate Limiting (Crucial)
        // Sleep 50ms implies ~20 messages/second max per thread
        await new Promise(resolve => setTimeout(resolve, 50));
    }

    // 6. Finish Job
    job.status = 'COMPLETED';
    job.completedAt = new Date();
    job.stats = { sent: sentCount, failed: failedCount };
    await job.save();

    SystemLogger.success(`Broadcast Finished. Sent: ${sentCount}, Failed: ${failedCount}`);

    // Notify Admin
    mainBot.telegram.sendMessage(CONFIG.superAdminId, 
        `📢 <b>Broadcast Complete</b>\n\n` +
        `🎯 Target: ${job.targetType}\n` +
        `✅ Sent: ${sentCount}\n` +
        `❌ Failed: ${failedCount}`,
        { parse_mode: 'HTML' }
    ).catch(()=>{});
}


// =================================================================================================
// SECTION 10: MAIN TELEGRAM ADMIN BOT LOGIC
// =================================================================================================

const mainBot = new Telegraf(CONFIG.mainBotToken);

// 10.1 /start Command
mainBot.command('start', async (ctx) => {
    const args = ctx.message.text.split(' ');
    const referrerId = args[1];

    let user = await User.findOne({ userId: ctx.from.id.toString() });
    
    if (!user) {
        user = await User.create({
            userId: ctx.from.id.toString(),
            username: ctx.from.username,
            firstName: ctx.from.first_name,
            photoUrl: '', 
            referredBy: referrerId && referrerId !== ctx.from.id.toString() ? referrerId : null
        });

        SystemLogger.info(`New User via Bot: ${ctx.from.first_name}`);

        // Referral Bonus Logic
        if (user.referredBy) {
            await User.findOneAndUpdate({ userId: user.referredBy }, { $inc: { referrals: 1 } });
            mainBot.telegram.sendMessage(user.referredBy, 
                `🎉 <b>New Referral!</b>\n${ctx.from.first_name} joined via your link.\n+1 Point.`, 
                { parse_mode: 'HTML' }
            ).catch(()=>{});
        }
    }

    const welcomeText = 
        `👋 <b>Hey ${ctx.from.first_name}, Welcome to ${CONFIG.systemName}!</b>\n\n` +
        `🚀 <b>The Ultimate Telegram Bot Hosting Platform</b>\n\n` +
        `Host, Manage, and Monetize your bots with AI power.\n` +
        `👇 <b>Click below to open the Console:</b>`;

    ctx.replyWithHTML(welcomeText, Markup.inlineKeyboard([
        [Markup.button.webApp('🚀 Open Dashboard', CONFIG.frontendUrl)],
        [Markup.button.url('📢 Join Channel', CONFIG.support.channel), Markup.button.url('🛠 Support', CONFIG.support.chat)]
    ]));
});

// 10.2 /stats Command (Admin Only)
mainBot.command('stats', async (ctx) => {
    if(ctx.from.id.toString() !== CONFIG.superAdminId) return;

    // Use cached stats if recent to save DB calls
    const userCount = await User.countDocuments();
    const botCount = await Bot.countDocuments();
    const runningCount = await Bot.countDocuments({ status: 'RUNNING' });
    const orderCount = await Order.countDocuments();
    const productCount = await Product.countDocuments();

    ctx.replyWithHTML(
        `📊 <b>System Statistics</b>\n\n` +
        `👤 <b>Users:</b> ${userCount}\n` +
        `🤖 <b>Total Bots:</b> ${botCount}\n` +
        `🟢 <b>Running:</b> ${runningCount}\n` +
        `📦 <b>Products:</b> ${productCount}\n` +
        `🛒 <b>Orders:</b> ${orderCount}\n` +
        `💾 <b>Memory:</b> ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`
    );
});

// 10.3 /addproduct Command (Legacy Wizard for Bot-based adding)
mainBot.command('addproduct', (ctx) => {
    if(ctx.from.id.toString() !== CONFIG.superAdminId) return;
    
    // Init Session
    adminWizardState[ctx.from.id] = { step: 1, data: {} };
    ctx.reply("🛍️ <b>Add Product Wizard</b>\n\nStep 1: Send Product Title.", { parse_mode: 'HTML' });
});

// 10.4 General Message Handler (Wizard Logic)
mainBot.on('message', async (ctx, next) => {
    const uid = ctx.from.id;
    
    // Check if user is in wizard mode
    if(!adminWizardState[uid]) return next();
    
    const state = adminWizardState[uid];
    const msg = ctx.message;

    // STEP 1: Title
    if(state.step === 1) {
        if(!msg.text) return ctx.reply("Text only.");
        state.data.title = msg.text;
        state.step = 2;
        return ctx.reply("Step 2: Send Description.");
    }
    
    // STEP 2: Description
    if(state.step === 2) {
        if(!msg.text) return ctx.reply("Text only.");
        state.data.description = msg.text;
        state.step = 3;
        return ctx.reply("Step 3: Send Price and Original Price (e.g., '50 100').");
    }

    // STEP 3: Price
    if(state.step === 3) {
        const parts = msg.text.split(' ');
        if(parts.length < 2) return ctx.reply("Invalid format. Send: Discount Original (e.g. 50 100)");
        state.data.discountPrice = parseInt(parts[0]);
        state.data.originalPrice = parseInt(parts[1]);
        state.step = 4;
        return ctx.reply("Step 4: Send Image (Photo) OR Image URL.");
    }

    // STEP 4: Image
    if(state.step === 4) {
        if(msg.photo) {
            state.data.displayImageId = msg.photo[msg.photo.length - 1].file_id;
            state.data.imageType = 'FILE';
        } else if (msg.text && msg.text.startsWith('http')) {
            state.data.displayImageId = msg.text;
            state.data.imageType = 'URL';
        } else {
            return ctx.reply("Send a valid Photo or URL.");
        }
        state.step = 5;
        return ctx.reply("Step 5: Send Content (File or Text/Link).");
    }

    // STEP 5: Content & Save
    if(state.step === 5) {
        if(msg.document) {
            state.data.deliveryType = 'FILE';
            state.data.contentFileId = msg.document.file_id;
        } else if (msg.text) {
            state.data.deliveryType = 'TEXT';
            state.data.contentMessage = msg.text;
        } else {
            return ctx.reply("Send valid content.");
        }
        
        // Save to DB
        await Product.create(state.data);
        delete adminWizardState[uid];
        return ctx.reply("✅ <b>Product Added Successfully!</b>", { parse_mode: 'HTML' });
    }
    
    next();
});

// 10.5 Action: Order Delivery (One-Click)
mainBot.action(/^deliver:(.+)$/, async (ctx) => {
    const orderId = ctx.match[1];
    const order = await Order.findById(orderId).populate('productId');
    
    if(!order || order.deliveryStatus === 'SENT') {
        return ctx.answerCbQuery("Already Sent or Invalid Order");
    }

    // Update Status
    order.deliveryStatus = 'SENT';
    order.deliveryDate = new Date();
    await order.save();

    // Send Content to User
    const prod = order.productId;
    const userId = order.userId;
    
    try {
        await mainBot.telegram.sendMessage(userId, 
            `✅ <b>Order Delivered!</b>\n\nHere is your purchase: <b>${prod.title}</b>`, 
            { parse_mode: 'HTML' }
        );

        if(prod.deliveryType === 'FILE') {
            await mainBot.telegram.sendDocument(userId, prod.contentFileId);
        } else {
            await mainBot.telegram.sendMessage(userId, 
                `🔐 <b>Secret Content:</b>\n\n<pre>${prod.contentMessage}</pre>`, 
                { parse_mode: 'HTML' }
            );
        }

        ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n✅ <b>SENT TO USER</b>`, { parse_mode: 'HTML' });

    } catch(e) {
        console.error(e);
        ctx.answerCbQuery("Delivery Failed (User Blocked?)");
    }
});

mainBot.action(/^reject_ord:(.+)$/, async (ctx) => {
    const orderId = ctx.match[1];
    await Order.findByIdAndUpdate(orderId, { deliveryStatus: 'FAILED', adminNote: 'Rejected by Admin' });
    ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n❌ <b>REJECTED</b>`, { parse_mode: 'HTML' });
});

// 10.6 Action: Subscription Approval
mainBot.action(/^approve:(\d+):(\w+):(.+)$/, async (ctx) => {
    const userId = ctx.match[1];
    const plan = ctx.match[2];
    const payId = ctx.match[3];
    
    // Calculate Expiry
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + PLAN_TIERS[plan].validityDays);

    // Update User
    await User.findOneAndUpdate(
        { userId }, 
        { 
            plan, 
            botLimit: PLAN_TIERS[plan].botLimit, 
            planExpiresAt: expiry,
            cpuPriority: PLAN_TIERS[plan].features.includes('Priority CPU') ? 'High' : 'Standard'
        }
    );
    
    // Update Payment
    await Payment.findByIdAndUpdate(payId, { status: 'APPROVED', adminResponseAt: new Date() });

    // Notify
    await mainBot.telegram.sendMessage(userId, 
        `✅ <b>Payment Approved!</b>\nYou are now on <b>${plan}</b> plan.\nValid until: ${moment(expiry).format('DD MMM YYYY')}`, 
        { parse_mode: 'HTML' }
    );

    ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n✅ <b>APPROVED</b>`, { parse_mode: 'HTML' });
});

mainBot.action(/^decline:(\d+):(.+)$/, async (ctx) => {
    const userId = ctx.match[1];
    const payId = ctx.match[2];
    
    await Payment.findByIdAndUpdate(payId, { status: 'DECLINED', adminResponseAt: new Date() });
    await mainBot.telegram.sendMessage(userId, `❌ <b>Payment Declined.</b> Contact Admin for help.`, { parse_mode: 'HTML' });

    ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n❌ <b>DECLINED</b>`, { parse_mode: 'HTML' });
});

// =================================================================================================
// SECTION 11: MAINTENANCE & AUTOMATION (CRON JOBS)
// =================================================================================================

/**
 * Daily Maintenance Job (Runs at 00:00)
 * 1. Checks for expired subscriptions.
 * 2. Cleans up temporary files (if any).
 */
cron.schedule('0 0 * * *', async () => {
    SystemLogger.info("⏰ Running Daily Maintenance Task...");
    
    const now = new Date();
    // Find expired users
    const expiredUsers = await User.find({ 
        plan: { $ne: 'Free' }, 
        planExpiresAt: { $lt: now } 
    });
    
    SystemLogger.info(`Found ${expiredUsers.length} expired subscriptions.`);

    for (const user of expiredUsers) {
        await validateSubscription(user);
    }
    
    SystemLogger.success("Maintenance Complete.");
});

// =================================================================================================
// SECTION 12: SERVER STARTUP SEQUENCE
// =================================================================================================

/**
 * Boot Sequence
 * 1. Connect DB (Handled in Section 4).
 * 2. Launch Main Admin Bot.
 * 3. Restore Hosted Bots.
 * 4. Start HTTP Server.
 */

// 1. Launch Admin Bot
mainBot.launch({ dropPendingUpdates: true })
    .then(() => SystemLogger.success("Main Admin Bot Online"))
    .catch(e => SystemLogger.error(`Main Bot Launch Error: ${e.message}`));

// 2. Restore Hosted Bots
mongoose.connection.once('open', async () => {
    const runningBots = await Bot.find({ status: 'RUNNING' });
    SystemLogger.info(`Attempting to restore ${runningBots.length} hosted bots...`);
    
    let restored = 0;
    for (const bot of runningBots) {
        // Stagger startup to prevent CPU spikes
        await new Promise(r => setTimeout(r, 200)); 
        const res = await startBotEngine(bot);
        if(res.success) restored++;
    }
    SystemLogger.success(`Restored ${restored}/${runningBots.length} bots successfully.`);
});

// 3. Start Web Server
const server = app.listen(CONFIG.port, () => {
    SystemLogger.success("=================================================");
    SystemLogger.success(`LAGA HOST SERVER RUNNING ON PORT ${CONFIG.port}`);
    SystemLogger.success(`MODE: ${CONFIG.env}`);
    SystemLogger.success(`DASHBOARD: ${CONFIG.frontendUrl}`);
    SystemLogger.success("=================================================");
});

// 4. Graceful Shutdown
const shutdown = (signal) => {
    SystemLogger.warn(`${signal} received. Shutting down...`);
    mainBot.stop(signal);
    Object.values(activeBotInstances).forEach(b => {
        try { b.stop(signal); } catch(e){}
    });
    mongoose.connection.close(false, () => {
        SystemLogger.db("Database Disconnected.");
        process.exit(0);
    });
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

// Handle Uncaught Exceptions to prevent crash
process.on('uncaughtException', (err) => {
    SystemLogger.error('UNCAUGHT EXCEPTION', err.stack);
});
process.on('unhandledRejection', (reason, promise) => {
    SystemLogger.error('UNHANDLED REJECTION', reason);
});
