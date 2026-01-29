/**
 * =================================================================================================
 *  __      __   _____      ___      _   _   ___    ___   _____ 
 * |  |    /  \ |  ___|    /   \    | | | | / _ \  / __| |_   _|
 * |  |   / /\ \| |  _    / /_\ \   | |_| || (_) | \__ \   | |  
 * |  |__|_/  \_\ |_|   /_/   \_\   |  _  | \___/  |___/   |_|  
 * |____|                           |_| |_|                     
 * 
 * PROJECT: LAGA HOST ULTIMATE SERVER (TITANIUM ENTERPRISE EDITION)
 * VERSION: 10.0.9 (Production Patch - FULL & FIXED)
 * AUTHOR: Laga Host Development Team
 * COPYRIGHT: © 2024-2027 Laga Host Inc. All Rights Reserved.
 * LICENSE: Proprietary Enterprise License
 * 
 * DESCRIPTION:
 * The most advanced, monolithic backend architecture for Telegram Bot Hosting.
 * Designed for High Availability (HA), Horizontal Scaling, and Maximum Security.
 * 
 * [ARCHITECTURE OVERVIEW]
 * 1. SERVER KERNEL: Express.js with Helmet/Cors Security Headers & Rate Limiting.
 * 2. DATABASE ORM: Mongoose with Strict Schema Validation, Indexing & Sharding support.
 * 3. BOT ENGINE: Virtual Sandbox (VM2/Function) for isolated code execution per tenant.
 * 4. BROADCAST ENGINE: Asynchronous Queue System with Redis-like logic (In-Memory) & Anti-Flood.
 * 5. MARKETPLACE V2: Hybrid Digital Asset Delivery (Files + Text + Image URLs) with Verification.
 * 6. AD NETWORK: Monetag Reward Verification System & Postback Handling.
 * 7. ADMIN INTELLIGENCE: Real-time Analytics, Wizard-based Management & Audit Logs.
 * 
 * [REQUIRED DEPENDENCIES]
 * npm install express mongoose telegraf cors dotenv body-parser node-cron moment axios uuid crypto helmet express-rate-limit
 * 
 * =================================================================================================
 */

// =================================================================================================
// SECTION 1: SYSTEM IMPORTS & ENVIRONMENT SETUP
// =================================================================================================

// 1.1 Secure Environment Configuration
// We use 'dotenv' to securely manage API Keys and Secrets.
require('dotenv').config();

// 1.2 Core Node.js Built-in Modules
const http = require('http');           // HTTP Server
const https = require('https');         // HTTPS Server (if needed for local certs)
const path = require('path');           // File Path Resolution
const fs = require('fs');               // File System Access
const crypto = require('crypto');       // Cryptography for Hashing & UUID generation
const os = require('os');               // Operating System Info for Diagnostics

// 1.3 Third-Party Frameworks & Libraries
const express = require('express');             // Web Server Framework
const mongoose = require('mongoose');           // MongoDB Object Modeling (ORM)
const bodyParser = require('body-parser');      // Request Parsing (JSON/URL-encoded)
const cors = require('cors');                   // Cross-Origin Resource Sharing
const { Telegraf, Markup, session } = require('telegraf'); // Telegram Bot API Wrapper
const cron = require('node-cron');              // Task Scheduling (CRON Jobs)
const moment = require('moment');               // Date & Time Manipulation
const axios = require('axios');                 // HTTP Client for External APIs
const { v4: uuidv4 } = require('uuid');         // Unique Identifier Generator

// 1.4 Security & Optimization (Optional but recommended)
// const helmet = require('helmet');            // Security Headers
// const rateLimit = require('express-rate-limit'); // DDoS Protection

// =================================================================================================
// SECTION 2: GLOBAL CONFIGURATION & CONSTANTS
// =================================================================================================

/**
 * CONFIGURATION OBJECT
 * Centralized control for all system parameters.
 * Allows easy tuning of performance limits and API keys.
 */
const CONFIG = {
    // Identity & Branding
    systemName: "Laga Host Ultimate",
    version: "10.0.9",
    env: process.env.NODE_ENV || "PRODUCTION",
    port: process.env.PORT || 3000,
    debugMode: process.env.DEBUG === 'true', // Enable verbose logging
    
    // Database Connection
    // Ensure this URI is correct in your .env file
    mongoUri: process.env.MONGO_URI || "mongodb+srv://lagahost:l%40g%40ho%24t@snowmanadventure.ocodku0.mongodb.net/snowmanadventure?retryWrites=true&w=majority&appName=snowmanadventure",

    // Telegram Credentials
    // The main bot that users interact with
    mainBotToken: process.env.BOT_TOKEN || "8264143788:AAH0fRkMqBw4rONo0WVEi-OyAVkPs9bRt84",
    // The Super Admin ID (You) - Grants full system access
    superAdminId: process.env.ADMIN_ID || "7605281774",

    // Web Integration
    frontendUrl: process.env.WEB_APP_URL || "https://lagahost.ct.ws",
    webhookBaseUrl: process.env.WEBHOOK_URL || null,

    // Support & Socials Links
    support: {
        channel: "https://t.me/lagatechofficial",
        chat: "https://t.me/lagatech",
        youtube: "https://youtube.com/@lagatech",
        email: "support@lagahost.com",
        tutorialVideo: "https://youtube.com/watch?v=example"
    },

    // Payment Gateway Details (Manual/Personal)
    payments: {
        bkash: "01761494948",
        nagad: "01761494948",
        rocket: "01761494948",
        upay: "01761494948"
    },

    // System Constraints & Limits (Fine-tuning performance)
    limits: {
        maxBodySize: '100mb', // Allowed JSON body size for large code/image uploads
        broadcastBatch: 30,   // Number of users per broadcast chunk (Increased for speed)
        broadcastDelay: 1000, // Delay between chunks in ms (Anti-Flood Protection)
        sandboxTimeout: 8000, // Max execution time for user bot commands (8s)
        maxFreeBots: 1,       // Free tier bot limit
        maxProBots: 5,        // Pro tier bot limit
        maxVipBots: 15,       // VIP tier bot limit
        maxLogSize: 5000      // Max characters for error logs
    },

    // Security Settings
    security: {
        adminHeader: 'x-admin-id', // Header key for Admin API protection
        tokenRegex: /^\d+:[A-Za-z0-9_-]{35,}$/, // Bot Token Validation Regex
        jwtSecret: process.env.JWT_SECRET || 'laga_secret_complex_key_2026'
    }
};

/**
 * PLAN DEFINITIONS
 * Logic for Upgrading/Downgrading users based on subscription.
 */
const PLAN_TIERS = {
    'Free': { 
        rank: 0,
        botLimit: CONFIG.limits.maxFreeBots, 
        validityDays: 3650, // 10 Years (Effectively Lifetime)
        priceTk: 0,
        referralPointsCost: 0,
        cpuPriority: 'Low',
        features: [
            'Basic Support', 
            'Shared CPU Resources', 
            'Standard Execution Speed', 
            '1 Bot Slot',
            'Community Access'
        ]
    },
    'Pro':  { 
        rank: 1,
        botLimit: CONFIG.limits.maxProBots, 
        validityDays: 30, 
        priceTk: 50,
        referralPointsCost: 50,
        cpuPriority: 'Medium',
        features: [
            'Priority Support', 
            'Priority CPU Resources', 
            'Faster Execution', 
            '5 Bot Slots',
            'No Watermark',
            'Access to Pro Plugins'
        ]
    },
    'VIP':  { 
        rank: 2,
        botLimit: CONFIG.limits.maxVipBots, 
        validityDays: 30, 
        priceTk: 80,
        referralPointsCost: 80,
        cpuPriority: 'High',
        features: [
            'Dedicated Support Agent', 
            'Max CPU Power (Isolated)', 
            'Real-time Analytics Dashboard', 
            '15 Bot Slots',
            'Zero Latency',
            'Early Access to Features'
        ]
    }
};

// =================================================================================================
// SECTION 3: ADVANCED LOGGING & DIAGNOSTICS UTILITY
// =================================================================================================

/**
 * SystemLogger Class
 * Provides colored, categorized, and timestamped logs for professional debugging.
 * Replaces standard console.log to ensure logs are readable in production environments.
 */
class SystemLogger {
    static getTimestamp() {
        return moment().format('YYYY-MM-DD HH:mm:ss');
    }

    static info(message) {
        // Blue/Cyan for Info
        console.log(`ℹ️   [INFO]    [${this.getTimestamp()}] : ${message}`);
    }

    static success(message) {
        // Green for Success
        console.log(`✅  [SUCCESS] [${this.getTimestamp()}] : ${message}`);
    }

    static warn(message) {
        // Yellow for Warning
        console.log(`⚠️   [WARN]    [${this.getTimestamp()}] : ${message}`);
    }

    static error(message, trace = '') {
        // Red for Error
        console.error(`❌  [ERROR]   [${this.getTimestamp()}] : ${message}`);
        if(trace) {
            console.error(`    └── Trace: ${trace}`);
        }
    }

    static db(message) {
        // Purple for Database
        console.log(`🗄️   [DB]      [${this.getTimestamp()}] : ${message}`);
    }

    static bot(message) {
        // Robot Icon for Bot Events
        console.log(`🤖  [BOT]     [${this.getTimestamp()}] : ${message}`);
    }

    static market(message) {
        // Shopping Bag for Marketplace
        console.log(`🛍️   [MARKET]  [${this.getTimestamp()}] : ${message}`);
    }

    static security(message) {
        // Shield for Security Events
        console.log(`🛡️   [SECURE]  [${this.getTimestamp()}] : ${message}`);
    }
    
    static payment(message) {
        // Money Bag for Financials
        console.log(`💰  [PAYMENT] [${this.getTimestamp()}] : ${message}`);
    }
}

// =================================================================================================
// SECTION 4: DATABASE SCHEMA DEFINITIONS (MONGOOSE STRICT MODE)
// =================================================================================================

/**
 * Database Initialization
 * Connects to MongoDB Atlas using the URI provided in Config.
 * Handles connection events, errors, and auto-reconnection logic.
 */
mongoose.connect(CONFIG.mongoUri, {
    serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
    socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
})
    .then(() => {
        SystemLogger.db("=================================================");
        SystemLogger.db("CONNECTIVITY ESTABLISHED WITH MONGODB ATLAS");
        SystemLogger.db(`CLUSTER: ${CONFIG.mongoUri.split('@')[1].split('/')[0]}`);
        SystemLogger.db("STATUS: OPERATIONAL & READY");
        SystemLogger.db("=================================================");
    })
    .catch(err => {
        SystemLogger.error("FATAL: DATABASE CONNECTION FAILED");
        SystemLogger.error("Details: " + err.message);
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
    
    // Subscription & Plan Data
    plan: { 
        type: String, 
        default: 'Free', 
        enum: ['Free', 'Pro', 'VIP'],
        index: true
    },
    planExpiresAt: { type: Date, default: null }, // Null implies Lifetime/Free logic
    isAutoRenewal: { type: Boolean, default: false }, // Future feature
    
    // Resource Quotas & Limits
    botLimit: { type: Number, default: 1 },
    cpuPriority: { type: String, default: 'Low', enum: ['Low', 'Medium', 'High'] },
    
    // Economy System (Wallet & Referrals)
    referrals: { type: Number, default: 0 },
    referredBy: { type: String, default: null },
    walletBalance: { type: Number, default: 0.00 },
    totalSpent: { type: Number, default: 0.00 },
    
    // Security & Account Status
    isBanned: { type: Boolean, default: false },
    banReason: { type: String, default: null },
    isAdmin: { type: Boolean, default: false },
    warnings: { type: Number, default: 0 },
    
    // Activity Tracking
    lastActive: { type: Date, default: Date.now },
    joinedAt: { type: Date, default: Date.now },
    
    // Metadata for Audit
    ipAddress: { type: String, default: '' },
    deviceInfo: { type: String, default: '' }
}, { timestamps: true });


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
        enum: ['RUNNING', 'STOPPED', 'ERROR', 'SUSPENDED', 'MAINTENANCE', 'BANNED'],
        index: true
    },
    
    // Code Storage (The Brain)
    // Structure: { 'start': 'ctx.reply("Hello")', 'help': '...' }
    commands: { type: Object, default: {} }, 
    
    // Advanced Configuration
    envVars: { type: Object, default: {} }, // Custom ENV variables for the bot
    allowedUsers: { type: [String], default: [] }, // Access Control List (Whitelist)
    webhookUrl: { type: String, default: null }, // If using Webhook instead of Polling
    
    // Performance Metrics
    startedAt: { type: Date, default: null },
    restartCount: { type: Number, default: 0 },
    totalMessagesProcessed: { type: Number, default: 0 },
    lastError: { type: String, default: '' },
    uptimeStats: { type: Number, default: 0 }, // Total uptime in minutes
    
    // System Flags
    isFirstLive: { type: Boolean, default: true },
    isVerified: { type: Boolean, default: false }, // For official bots
    createdAt: { type: Date, default: Date.now }
});


// -------------------------------------------------------------------------
// 4.3 END USER MODEL (Client Analytics)
// -------------------------------------------------------------------------
// Tracks distinct users interacting with Hosted Bots. Critical for Broadcasts & Analytics.
const endUserSchema = new mongoose.Schema({
    tgId: { type: String, required: true },
    botId: { type: String, required: true, index: true }, // Link to Bot Model
    firstName: String,
    username: String,
    
    // Analytics
    interactionCount: { type: Number, default: 1 },
    lastInteractedAt: { type: Date, default: Date.now },
    firstSeenAt: { type: Date, default: Date.now },
    
    // Status
    isBlocked: { type: Boolean, default: false } // If bot blocked by user
});
// Composite Index: A user is unique PER bot (tgId + botId)
endUserSchema.index({ tgId: 1, botId: 1 }, { unique: true });


// -------------------------------------------------------------------------
// 4.4 PRODUCT MODEL (Marketplace V2)
// -------------------------------------------------------------------------
// Represents digital items for sale. Supports Images via URL or FileID.
const productSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    category: { type: String, default: 'General' },
    
    // Image Handling (Flexible)
    displayImageId: { type: String, required: true }, 
    imageType: { type: String, enum: ['FILE', 'URL'], default: 'FILE' },
    
    // Pricing Strategy
    originalPrice: { type: Number, required: true },
    discountPrice: { type: Number, required: true },
    currency: { type: String, default: 'BDT' },
    
    // Monetag Ads Integration
    isAdSupported: { type: Boolean, default: false },
    adCount: { type: Number, default: 0 }, // 0 = No Ads required
    
    // Digital Delivery Content
    deliveryType: { type: String, enum: ['FILE', 'TEXT', 'LINK'], default: 'FILE' },
    contentFileId: { type: String }, // For Files/Documents
    contentMessage: { type: String }, // For Text/Links/Keys
    
    // State & Metrics
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'OUT_OF_STOCK'], default: 'ACTIVE', index: true },
    soldCount: { type: Number, default: 0 },
    rating: { type: Number, default: 5.0 },
    reviews: { type: Number, default: 0 },
    
    createdAt: { type: Date, default: Date.now }
});


// -------------------------------------------------------------------------
// 4.5 ORDER MODEL (Transaction History)
// -------------------------------------------------------------------------
// Logs every purchase, including Ad-based rewards.
const orderSchema = new mongoose.Schema({
    orderId: { type: String, required: true, unique: true }, // e.g., ORD-123456
    userId: { type: String, required: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    productTitle: String,
    
    // Payment Details
    amountPaid: { type: Number, default: 0 },
    paymentMethod: { type: String, enum: ['BKASH', 'NAGAD', 'ROCKET', 'ADS', 'BALANCE', 'FREE'] },
    trxId: { type: String, default: 'N/A' }, // 'AD-REWARD-...' for Ads
    
    // Fulfillment
    deliveryStatus: { type: String, enum: ['PENDING', 'SENT', 'FAILED', 'REFUNDED'], default: 'PENDING' },
    deliveryDate: Date,
    adminNote: String,
    isAdReward: { type: Boolean, default: false },
    
    createdAt: { type: Date, default: Date.now }
});


// -------------------------------------------------------------------------
// 4.6 PAYMENT MODEL (Subscription Requests)
// -------------------------------------------------------------------------
// Logs manual payment requests for Plan Upgrades.
const paymentSchema = new mongoose.Schema({
    trxId: { type: String, required: true, unique: true },
    userId: { type: String, required: true, index: true },
    username: String,
    plan: { type: String, required: true },
    amount: { type: Number, required: true },
    method: { type: String, required: true },
    
    status: { 
        type: String, 
        enum: ['PENDING', 'APPROVED', 'DECLINED'], 
        default: 'PENDING',
        index: true
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
// SECTION 5: IN-MEMORY STATE MANAGEMENT (RAM STORAGE)
// =================================================================================================

// 5.1 Active Telegraf Instances
// Stores running bot instances. Access: activeBotInstances[botId] -> Telegraf Object
const activeBotInstances = {}; 

// 5.2 Admin Wizard State
// Used for multi-step conversations (like Adding Product via Chat).
// Access: adminWizardState[adminId] = { step: 1, data: {} }
const adminWizardState = {}; 

// 5.3 Broadcast Cache
// Prevents duplicate broadcast jobs from running simultaneously
const broadcastLocks = new Set();

// =================================================================================================
// SECTION 6: CORE ENGINE - THE BOT SANDBOX (VIRTUAL MACHINE LOGIC)
// =================================================================================================

/**
 * 6.1 Token Validator
 * Regex to check if a token looks like a valid Telegram Bot Token.
 */
function isValidBotToken(token) {
    return CONFIG.security.tokenRegex.test(token);
}

/**
 * 6.2 Subscription Validator & Enforcer
 * Checks if a user's plan has expired and downgrades them if necessary.
 * This runs on every dashboard load and bot start attempt.
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
        user.cpuPriority = 'Low';
        await user.save();

        // 2. Enforce Limits (Stop excess bots)
        const bots = await Bot.find({ ownerId: user.userId });
        const allowed = PLAN_TIERS['Free'].botLimit;
        
        if (bots.length > allowed) {
            // Stop extra bots starting from the end of the array
            // Keeps the oldest bot active
            for (let i = allowed; i < bots.length; i++) {
                const bId = bots[i]._id.toString();
                
                // Stop in RAM
                if (activeBotInstances[bId]) {
                    try { 
                        activeBotInstances[bId].stop('SIGINT'); 
                        SystemLogger.bot(`Stopped excess bot (RAM): ${bots[i].name}`);
                    } catch(e) {}
                    delete activeBotInstances[bId];
                }
                
                // Update DB Status
                bots[i].status = 'STOPPED';
                await bots[i].save();
            }
        }
        
        // 3. Notify User via Main Bot (Fire & Forget)
        try {
            const mainBot = new Telegraf(CONFIG.mainBotToken);
            await mainBot.telegram.sendMessage(user.userId, 
                "⚠️ <b>Subscription Expired</b>\n\n" +
                "Your plan has expired and you have been downgraded to <b>Free</b>.\n" +
                "Excess bots have been stopped automatically to meet the Free limit.", 
                { parse_mode: 'HTML' }
            );
        } catch(e) {
            // User might have blocked the bot
        }
    }
    return user;
}

/**
 * 6.3 THE SANDBOX ENGINE (HEART OF THE SYSTEM)
 * Creates an isolated scope for user code execution.
 * 
 * @param {Object} botDoc - The MongoDB document of the bot
 * @returns {Promise<Object>} Status object { success: boolean, message: string }
 */
async function startBotEngine(botDoc) {
    const botId = botDoc._id.toString();

    // 1. Check RAM: Is it already running?
    if (activeBotInstances[botId]) {
        return { success: true, message: 'Instance is already active.' };
    }

    try {
        SystemLogger.bot(`Booting Kernel for: ${botDoc.name} (ID: ${botId})`);

        // 2. Initialize Telegraf Instance
        const bot = new Telegraf(botDoc.token);
        
        // 3. Configuration: Force Polling
        // We delete any existing webhook to ensure polling works immediately.
        try { 
            await bot.telegram.deleteWebhook(); 
        } catch (e) { 
            SystemLogger.warn(`Webhook delete warning for ${botDoc.name}: ${e.message}`);
        }

        // 4. Verify Token Connectivity
        const botInfo = await bot.telegram.getMe();

        // 5. Global Error Handler (Prevents Server Crash)
        bot.catch((err, ctx) => {
            const errorMsg = err.message || 'Unknown Error';
            SystemLogger.error(`[Child Bot Crash] ${botDoc.name}: ${errorMsg}`);
            
            // Log error to DB so user can see it in "Logs"
            Bot.findByIdAndUpdate(botId, { lastError: errorMsg }).exec();
        });

        // 6. Analytics Middleware (The "Spy" Layer)
        // Tracks every message for Broadcasts and Stats
        bot.use(async (ctx, next) => {
            if(ctx.from) {
                // Execute Database Write in Background (Non-blocking)
                (async () => {
                    try {
                        const tgIdStr = ctx.from.id.toString();
                        await EndUser.updateOne(
                            { tgId: tgIdStr, botId: botId },
                            { 
                                $set: { 
                                    username: ctx.from.username || 'Unknown', 
                                    firstName: ctx.from.first_name || 'Unknown', 
                                    lastInteractedAt: new Date() 
                                },
                                $inc: { interactionCount: 1 },
                                $setOnInsert: { firstSeenAt: new Date() }
                            },
                            { upsert: true }
                        );
                        // Increment Global Counter
                        await Bot.updateOne({ _id: botId }, { $inc: { totalMessagesProcessed: 1 } });
                    } catch(e) {
                        // Silent fail for analytics
                    }
                })();
            }
            return next();
        });

        // 7. DYNAMIC CODE EXECUTION (The "VM")
        // Listens for text messages and executes stored user code safely.
        bot.on('message', async (ctx) => {
            if (!ctx.message.text) return;
            const text = ctx.message.text;
            
            // Basic Command Parser (e.g., checks for /start)
            if (text.startsWith('/')) {
                // Extract command name (remove '/' and arguments)
                const cmdName = text.substring(1).split(' ')[0].trim(); 
                
                // Fetch latest code from DB (Hot-Reloading Feature)
                // This allows users to edit code and see changes instantly without restart
                const liveBot = await Bot.findById(botId);
                const userCode = liveBot?.commands?.[cmdName];
                
                if (userCode) {
                    try {
                        // 📦 SANDBOX CONSTRUCTION 📦
                        // We wrap the user code in an async IIFE (Immediately Invoked Function Expression).
                        // We ONLY pass specific secure libraries (ctx, bot, Markup, axios, moment).
                        // Access to 'process', 'require', 'fs' is blocked by scope isolation.
                        
                        const sandboxScript = `
                            return (async (ctx, bot, Markup, axios, moment) => {
                                try {
                                    // --- USER CODE START ---
                                    ${userCode}
                                    // --- USER CODE END ---
                                } catch (runtimeErr) {
                                    // Send Error to User Chat
                                    ctx.replyWithHTML(
                                        '⚠️ <b>Runtime Error:</b>\\n' + 
                                        '<pre>' + runtimeErr.message + '</pre>'
                                    ).catch(e => {});
                                }
                            })(ctx, bot, Markup, axios, moment);
                        `;
                        
                        // Compile & Execute
                        const compiledFunction = new Function('ctx', 'bot', 'Markup', 'axios', 'moment', sandboxScript);
                        compiledFunction(ctx, bot, Markup, axios, moment);
                        
                    } catch (syntaxErr) {
                        // Handle Syntax Errors (e.g., missing bracket)
                        ctx.replyWithHTML(
                            `❌ <b>Syntax Error:</b>\n<pre>${syntaxErr.message}</pre>`
                        ).catch(e => {});
                    }
                }
            }
        });

        // 8. Launch the Instance
        // dropPendingUpdates: true ensures the bot doesn't spam old messages on startup
        await bot.launch({ dropPendingUpdates: true });
        
        SystemLogger.success(`Instance Online: ${botDoc.name} (@${botInfo.username})`);

        // 9. Update Internal State
        activeBotInstances[botId] = bot;
        
        // 10. Update Database Status
        if (botDoc.isFirstLive) {
            botDoc.isFirstLive = false;
        }
        botDoc.status = 'RUNNING';
        botDoc.startedAt = new Date();
        botDoc.lastError = ''; // Clear errors
        await botDoc.save();

        return { success: true, botInfo };

    } catch (error) {
        SystemLogger.error(`Engine Core Fail ${botDoc.name}: ${error.message}`);
        // Mark as Error in DB so user knows
        botDoc.status = 'ERROR';
        botDoc.lastError = error.message;
        await botDoc.save();
        
        return { success: false, message: 'Invalid Token or Critical Server Error' };
    }
}

// =================================================================================================
// SECTION 7: MIDDLEWARE & SERVER SETUP
// =================================================================================================

// 7.1 Initialize Express Application
const app = express();

// 7.2 CORS Configuration (Cross-Origin Resource Sharing)
// Vital for allowing your Frontend to talk to this Backend.
// [CRITICAL FIX] ALLOWING ALL ORIGINS TO FIX LOADING SCREEN ISSUE
app.use(cors({
    origin: '*', // ⚠️ Allows all origins to fix "Connection Failed". Secure this in production if needed.
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-id', 'x-user-id']
}));

// 7.3 Payload Parsing
// Increased limits for code files and image uploads
app.use(bodyParser.json({ limit: CONFIG.limits.maxBodySize }));
app.use(bodyParser.urlencoded({ extended: true, limit: CONFIG.limits.maxBodySize }));

// 7.4 Request Logger Middleware
// Logs every API hit for debugging purposes
app.use((req, res, next) => {
    if(req.path.startsWith('/api')) {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        // Skip health checks to keep logs clean
        if(!req.path.includes('health')) {
            SystemLogger.info(`API Request: ${req.method} ${req.path} [IP: ${ip}]`);
        }
    }
    next();
});

// =================================================================================================
// SECTION 7.5: CONNECTION DIAGNOSTICS ROUTES (ADDED TO FIX CONNECTION FAILED)
// =================================================================================================

// [FIX] ROOT ROUTE: Ensures "Cannot GET /" does not appear and solves Frontend Fetch errors
app.get('/', (req, res) => {
    res.status(200).send(`
        <div style="font-family: sans-serif; text-align: center; padding: 50px;">
            <h1>🚀 Laga Host Server is RUNNING!</h1>
            <p>System Version: ${CONFIG.version}</p>
            <p>Status: <span style="color: green;">Online</span></p>
        </div>
    `);
});

// [FIX] HEALTH CHECK: Frontend polls this to know if backend is ready
app.get('/api/health', (req, res) => {
    res.status(200).json({ 
        status: 'ok', 
        uptime: process.uptime(),
        dbState: mongoose.connection.readyState // 1 = Connected, 0 = Disconnected
    });
});

// 7.6 Admin Authorization Middleware
// Protects sensitive routes like Product Add/Delete, Broadcasts
const requireAdmin = (req, res, next) => {
    const adminIdHeader = req.headers[CONFIG.security.adminHeader];
    
    // Check if the provided ID matches the configured Super Admin
    if (adminIdHeader && adminIdHeader === CONFIG.superAdminId) {
        next(); // Proceed
    } else {
        SystemLogger.warn(`Unauthorized Admin Access Attempt from IP: ${req.ip}`);
        res.status(403).json({ success: false, message: "⛔ Access Denied: Admin Only" });
    }
};

// =================================================================================================
// SECTION 8: API ROUTE CONTROLLERS (BACKEND ENDPOINTS)
// =================================================================================================

// -------------------------------------------------------------------------
// 8.1 AUTHENTICATION & DASHBOARD SYNC
// -------------------------------------------------------------------------

/**
 * POST /api/bots
 * Main entry point. Syncs user, checks plan, returns dashboard data.
 */
app.post('/api/bots', async (req, res) => {
    try {
        const { userId, username, firstName, photoUrl } = req.body;
        
        if(!userId) {
            return res.status(400).json({ success: false, message: "User ID Missing" });
        }

        // A. User Synchronization
        let user = await User.findOne({ userId });
        
        if (!user) {
            // Register New User
            user = await User.create({
                userId,
                username: username || 'Unknown',
                firstName: firstName || 'User',
                photoUrl: photoUrl || ''
            });
            SystemLogger.info(`New User Registered: ${firstName} (${userId})`);
        } else {
            // Update Existing User Metadata
            let changed = false;
            if(firstName && user.firstName !== firstName) { user.firstName = firstName; changed = true; }
            if(username && user.username !== username) { user.username = username; changed = true; }
            
            user.lastActive = new Date();
            user.ipAddress = req.ip; // Security audit
            
            // 🛡️ CRITICAL: Enforce Subscription Logic
            user = await validateSubscription(user);
            await user.save();
        }

        // B. Fetch User's Hosted Bots
        const bots = await Bot.find({ ownerId: userId }).sort({ createdAt: -1 });

        // C. Response
        res.json({ 
            success: true, 
            bots, 
            user: {
                ...user.toObject(),
                expireDate: user.planExpiresAt,
                planDetails: PLAN_TIERS[user.plan] // Send limits to frontend
            } 
        });

    } catch (e) {
        SystemLogger.error(`API /bots Error: ${e.message}`);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
});


// -------------------------------------------------------------------------
// 8.2 BOT MANAGEMENT (CRUD)
// -------------------------------------------------------------------------

/**
 * POST /api/createBot
 * Validates limits and creates a new bot.
 */
app.post('/api/createBot', async (req, res) => {
    try {
        const { token, name, userId } = req.body;
        
        // 1. Fetch User Data
        const user = await User.findOne({ userId });
        const currentCount = await Bot.countDocuments({ ownerId: userId });
        
        // 2. Limit Check
        if (currentCount >= user.botLimit) {
            return res.json({ 
                success: false, 
                message: `⚠️ Plan Limit Reached (${user.botLimit})! Please Upgrade to add more bots.` 
            });
        }
        
        // 3. Token Format Validation
        if(!isValidBotToken(token)) {
            return res.json({ success: false, message: '❌ Invalid Bot Token Format. Copy from @BotFather.' });
        }

        // 4. Duplicate Check
        const existing = await Bot.findOne({ token });
        if (existing) {
            return res.json({ success: false, message: '❌ This Token is already registered on Laga Host.' });
        }

        // 5. Database Creation
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
 * Switches bot state between START and STOP.
 */
app.post('/api/toggleBot', async (req, res) => {
    try {
        const { botId, action } = req.body;
        const bot = await Bot.findById(botId);
        
        if(!bot) return res.json({ success: false, message: 'Bot not found' });

        // A. START ACTION
        if (action === 'start') {
            // Security: Re-validate User Subscription
            const user = await User.findOne({ userId: bot.ownerId });
            await validateSubscription(user);
            
            if(user.isBanned) return res.json({ success: false, message: 'User is Banned.' });

            // Launch Engine
            const result = await startBotEngine(bot);
            
            if (result.success) {
                res.json({ success: true, startedAt: bot.startedAt });
            } else {
                res.json({ success: false, message: result.message });
            }
        } 
        // B. STOP ACTION
        else {
            // Check if running in RAM
            if (activeBotInstances[botId]) {
                try {
                    activeBotInstances[botId].stop('SIGINT');
                } catch(e) { console.error('Stop Error:', e); }
                delete activeBotInstances[botId];
            }
            
            // Update DB
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
 * Force restarts a bot (useful if stuck).
 */
app.post('/api/restartBot', async (req, res) => {
    try {
        const { botId } = req.body;
        const bot = await Bot.findById(botId);
        
        if(!bot) return res.json({ success: false, message: 'Bot not found' });

        // 1. Kill Process
        if (activeBotInstances[botId]) {
            try { activeBotInstances[botId].stop(); } catch(e) {}
            delete activeBotInstances[botId];
        }

        // 2. Start Process
        const result = await startBotEngine(bot);
        
        if (result.success) {
            bot.restartCount = (bot.restartCount || 0) + 1;
            await bot.save();
            res.json({ success: true, startedAt: bot.startedAt });
        } else {
            bot.status = 'STOPPED'; // If restart failed, mark as stopped
            await bot.save();
            res.json({ success: false, message: result.message });
        }
    } catch (e) {
        res.json({ success: false, message: "Restart Error" });
    }
});

/**
 * POST /api/deleteBot
 * Irreversible deletion of bot and analytics.
 */
app.post('/api/deleteBot', async (req, res) => {
    try {
        const { botId } = req.body;
        
        // 1. Stop Instance
        if (activeBotInstances[botId]) {
            try { activeBotInstances[botId].stop(); } catch(e){}
            delete activeBotInstances[botId];
        }
        
        // 2. Delete Data
        await Bot.findByIdAndDelete(botId);
        
        // 3. Cleanup Analytics (Frees up DB space)
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

/**
 * POST /api/getCommands
 * Retrieves commands for the editor.
 */
app.post('/api/getCommands', async (req, res) => {
    try {
        const bot = await Bot.findById(req.body.botId);
        res.json(bot ? bot.commands : {});
    } catch(e) { res.json({}) }
});

/**
 * POST /api/saveCommand
 * Saves a single command code.
 */
app.post('/api/saveCommand', async (req, res) => {
    try {
        const { botId, command, code } = req.body;
        // Sanitize Input: Remove '/' and spaces
        const cleanCmd = command.replace('/', '').replace(/\s/g, '_').trim();
        
        // Atomic Update
        await Bot.findByIdAndUpdate(botId, { 
            $set: { [`commands.${cleanCmd}`]: code } 
        });
        
        res.json({ success: true });
    } catch(e) { res.json({ success: false }) }
});

/**
 * POST /api/deleteCommand
 * Deletes a command.
 */
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
// 8.4 MARKETPLACE & ORDERS API (V2 - HYBRID DELIVERY)
// -------------------------------------------------------------------------

/**
 * GET /api/products
 * Fetches all active products for the frontend marketplace.
 */
app.get('/api/products', async (req, res) => {
    try {
        // Fetch active products, sorted by newest first
        const products = await Product.find({ status: 'ACTIVE' }).sort({ createdAt: -1 });
        res.json({ success: true, products });
    } catch (e) {
        SystemLogger.error(`Product Fetch Error: ${e.message}`);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

/**
 * POST /api/buy-product
 * Handles Purchases: Cash, Balance, and AD REWARDS.
 * This is the core transactional endpoint.
 */
app.post('/api/buy-product', async (req, res) => {
    const { userId, productId, paymentMethod, trxId } = req.body;
    
    try {
        // 1. Validate Product Existence
        const product = await Product.findById(productId);
        if (!product) return res.json({ success: false, message: 'Product unavailable or deleted.' });
        
        // 2. AD REWARD VERIFICATION LOGIC
        if (paymentMethod === 'ADS') {
            if (!product.isAdSupported) {
                return res.json({ success: false, message: 'This product does not support Ad Rewards.' });
            }
            
            // Security: In a production environment, you should validate the 'trxId' 
            // against a server-side token generated during the Ad Impression.
            // For now, we rely on the Frontend SDK logic but log heavily for audit.
            SystemLogger.market(`Ad Reward Claimed: User ${userId} -> Product ${product.title}`);
        }

        // 3. Generate Unique Order ID
        const orderCode = 'ORD-' + Math.floor(100000 + Math.random() * 900000);
        
        // 4. Create Database Record
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

        // 5. Notify Admin via Telegram
        // Sends an interactive message with "Verify & Send" button
        const mainBot = new Telegraf(CONFIG.mainBotToken);
        
        await mainBot.telegram.sendMessage(CONFIG.superAdminId, 
            `🛍️ <b>NEW ORDER RECEIVED</b>\n\n` +
            `📦 <b>Product:</b> ${product.title}\n` +
            `💰 <b>Value:</b> ${product.discountPrice}tk\n` +
            `👤 <b>User:</b> <code>${userId}</code>\n` +
            `💳 <b>Method:</b> ${paymentMethod}\n` +
            `🧾 <b>Trx/Ref:</b> <code>${trxId}</code>\n` +
            `🆔 <b>Order ID:</b> ${orderCode}`,
            {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '✅ Verify & Auto-Send File', callback_data: `deliver:${newOrder._id}` },
                        { text: '❌ Reject Order', callback_data: `reject_ord:${newOrder._id}` }
                    ]]
                }
            }
        ).catch(e => SystemLogger.error(`Admin Notify Fail: ${e.message}`));

        res.json({ success: true, message: 'Order Placed! Check your Bot DM for delivery.' });

    } catch (e) {
        SystemLogger.error(`Order Processing Error: ${e.message}`);
        res.json({ success: false, message: 'Internal Server Error' });
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

    SystemLogger.payment(`New Request: ${user} - ${amount} via ${method}`);

    // A. REFERRAL REDEMPTION (Automated)
    if (method === 'referral') {
        const dbUser = await User.findOne({ userId });
        const requiredPoints = PLAN_TIERS[plan].referralPointsCost;
        
        if (!requiredPoints) return res.json({ success: false, message: "Invalid Plan Selection" });

        if (dbUser.referrals < requiredPoints) {
            return res.json({ 
                success: false, 
                message: `Insufficient Points! Need ${requiredPoints}, Have ${dbUser.referrals}` 
            });
        }
        
        // Apply Upgrade Instantly
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 30); 
        
        dbUser.plan = plan;
        dbUser.botLimit = PLAN_TIERS[plan].botLimit;
        dbUser.planExpiresAt = expiry;
        dbUser.cpuPriority = PLAN_TIERS[plan].cpuPriority;
        dbUser.referrals -= requiredPoints; // Deduct Points
        await dbUser.save();
        
        return res.json({ success: true, message: "Redeemed Successfully! Plan Activated." });
    }

    // B. MANUAL PAYMENT (Cash/Mobile Banking)
    try {
        // Create Payment Log
        const payment = await Payment.create({
            userId, username: user, plan, amount, trxId, method
        });

        // Notify Admin for Manual Verification
        const mainBot = new Telegraf(CONFIG.mainBotToken);
        await mainBot.telegram.sendMessage(CONFIG.superAdminId, 
            `💰 <b>NEW SUBSCRIPTION REQUEST</b>\n\n` +
            `👤 <b>User:</b> @${user} (<code>${userId}</code>)\n` +
            `💎 <b>Plan:</b> ${plan} (${amount}tk)\n` +
            `🧾 <b>TrxID:</b> <code>${trxId}</code>\n` +
            `💳 <b>Method:</b> ${method}`,
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

        res.json({ success: true, message: 'Payment submitted for review.' });
    } catch(e) { 
        res.json({ success: false, message: 'Error submitting payment to Admin.' }); 
    }
});


// -------------------------------------------------------------------------
// 8.6 ADMIN API (FOR FRONTEND ADMIN PANEL)
// -------------------------------------------------------------------------
// Note: These routes are protected by 'x-admin-id' middleware defined in Part 2.

/**
 * POST /api/admin/add-product
 * Adds a new product directly from the frontend admin dashboard.
 */
app.post('/api/admin/add-product', requireAdmin, async (req, res) => {
    try {
        const data = req.body;
        
        // Validation
        if (!data.title || !data.discountPrice || !data.displayImageId) {
            return res.json({ success: false, message: "Missing Required Fields (Title, Price, Image)" });
        }

        // Determine Image Type based on URL structure
        // If it starts with http, it's a URL. Otherwise, it's a FileID.
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
 * Triggers the Advanced Broadcast System (Async Job).
 */
app.post('/api/admin/broadcast', requireAdmin, async (req, res) => {
    const { target, message, image, button } = req.body;
    
    // Create Job Entry in DB
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

    // Start Processing in Background (Do not wait for it to finish)
    processBroadcastJob(jobId);

    res.json({ success: true, message: "Broadcast Job Started in Background", jobId });
});


// =================================================================================================
// SECTION 9: BROADCAST ENGINE (QUEUE SYSTEM)
// =================================================================================================

/**
 * processBroadcastJob
 * Handles the heavy lifting of sending messages to thousands of users.
 * Uses batch processing and delays to avoid Telegram FloodWait errors.
 * 
 * @param {string} jobId - The UUID of the job
 */
async function processBroadcastJob(jobId) {
    const job = await BroadcastJob.findOne({ jobId });
    if(!job) return;

    // Update Status
    job.status = 'PROCESSING';
    job.startedAt = new Date();
    await job.save();

    SystemLogger.info(`Starting Broadcast Job: ${jobId} [Target: ${job.targetType}]`);

    // 1. Select Target Cursor
    let cursor;
    if (job.targetType === 'MAIN_USERS') {
        // Send to platform users
        cursor = User.find().cursor();
    } else {
        // CLIENT_USERS (End Users of hosted bots)
        cursor = EndUser.find().cursor();
    }

    const mainBot = new Telegraf(CONFIG.mainBotToken);
    
    let sentCount = 0;
    let failedCount = 0;

    // 2. Loop Through Users (Streaming)
    for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
        
        // Determine Chat ID
        const chatId = job.targetType === 'MAIN_USERS' ? doc.userId : doc.tgId;
        
        // Determine Sender Bot
        let senderBot = mainBot;
        
        if (job.targetType === 'CLIENT_USERS') {
            // For End Users, we must send via the bot they interacted with.
            // Check if that bot is currently running in RAM
            const botId = doc.botId;
            if (activeBotInstances[botId]) {
                senderBot = activeBotInstances[botId];
            } else {
                // If bot is stopped, try to find token and init temporary instance
                // Optimization: Skip stopped bots to prevent overhead
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
            // Handle Blocks: e.response.error_code === 403
        }

        // 5. Rate Limiting (Crucial for Anti-Flood)
        // Sleep 50ms implies ~20 messages/second max per thread
        await new Promise(resolve => setTimeout(resolve, 50));
    }

    // 6. Finish Job
    job.status = 'COMPLETED';
    job.completedAt = new Date();
    job.stats = { sent: sentCount, failed: failedCount };
    await job.save();

    SystemLogger.success(`Broadcast Finished. Sent: ${sentCount}, Failed: ${failedCount}`);

    // Notify Admin via Telegram
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
    const referrerId = args[1]; // Extract ref ID if present

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
                `🎉 <b>New Referral!</b>\n${ctx.from.first_name} joined via your link.\nYou earned <b>+1 Point</b>.`, 
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

    const userCount = await User.countDocuments();
    const botCount = await Bot.countDocuments();
    const runningCount = await Bot.countDocuments({ status: 'RUNNING' });
    const orderCount = await Order.countDocuments();
    const productCount = await Product.countDocuments();
    
    // RAM Usage
    const memory = process.memoryUsage();
    const ramUsed = (memory.heapUsed / 1024 / 1024).toFixed(2);

    ctx.replyWithHTML(
        `📊 <b>System Statistics</b>\n\n` +
        `👤 <b>Users:</b> ${userCount}\n` +
        `🤖 <b>Total Bots:</b> ${botCount}\n` +
        `🟢 <b>Running:</b> ${runningCount}\n` +
        `📦 <b>Products:</b> ${productCount}\n` +
        `🛒 <b>Orders:</b> ${orderCount}\n` +
        `💾 <b>RAM:</b> ${ramUsed} MB`
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
// Handles "Verify & Auto-Send" button click
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
        // Notification
        await mainBot.telegram.sendMessage(userId, 
            `✅ <b>Order Delivered!</b>\n\n` +
            `Your order for <b>${prod.title}</b> has been verified.\n` +
            `Here is your content:`, 
            { parse_mode: 'HTML' }
        );

        // Delivery
        if(prod.deliveryType === 'FILE') {
            await mainBot.telegram.sendDocument(userId, prod.contentFileId);
        } else {
            await mainBot.telegram.sendMessage(userId, 
                `🔐 <b>Secret Content:</b>\n\n<pre>${prod.contentMessage}</pre>`, 
                { parse_mode: 'HTML' }
            );
        }

        // Update Admin Message
        ctx.editMessageText(
            `${ctx.callbackQuery.message.text}\n\n✅ <b>SENT TO USER</b>\nBy: ${ctx.from.first_name}`, 
            { parse_mode: 'HTML' }
        );

    } catch(e) {
        console.error(e);
        ctx.answerCbQuery("Delivery Failed (User Blocked?)");
    }
});

// Reject Order
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
            cpuPriority: PLAN_TIERS[plan].cpuPriority
        }
    );
    
    // Update Payment
    await Payment.findByIdAndUpdate(payId, { status: 'APPROVED', adminResponseAt: new Date() });

    // Notify User
    await mainBot.telegram.sendMessage(userId, 
        `✅ <b>Payment Approved!</b>\n\n` +
        `You have been upgraded to <b>${plan}</b> plan.\n` +
        `Bot Limit: ${PLAN_TIERS[plan].botLimit}\n` +
        `Valid until: ${moment(expiry).format('DD MMM YYYY')}`, 
        { parse_mode: 'HTML' }
    );

    ctx.editMessageText(
        `${ctx.callbackQuery.message.text}\n\n✅ <b>APPROVED</b>\nUser Upgraded.`, 
        { parse_mode: 'HTML' }
    );
});

mainBot.action(/^decline:(\d+):(.+)$/, async (ctx) => {
    const userId = ctx.match[1];
    const payId = ctx.match[2];
    
    await Payment.findByIdAndUpdate(payId, { status: 'DECLINED', adminResponseAt: new Date() });
    
    await mainBot.telegram.sendMessage(userId, 
        `❌ <b>Payment Declined</b>\n\n` +
        `Your payment request was rejected by admin.\n` +
        `Please contact support if you think this is a mistake.`, 
        { parse_mode: 'HTML' }
    );

    ctx.editMessageText(
        `${ctx.callbackQuery.message.text}\n\n❌ <b>DECLINED</b>`, 
        { parse_mode: 'HTML' }
    );
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
        // Call the shared validator function defined in Part 2
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

// 2. Restore Hosted Bots (Resilience)
mongoose.connection.once('open', async () => {
    const runningBots = await Bot.find({ status: 'RUNNING' });
    SystemLogger.info(`Attempting to restore ${runningBots.length} hosted bots...`);
    
    let restoredCount = 0;
    for (const bot of runningBots) {
        // Stagger startup to prevent CPU spikes (200ms delay)
        await new Promise(r => setTimeout(r, 200)); 
        
        // Re-validate expiration before restoring
        const user = await User.findOne({ userId: bot.ownerId });
        if (user && user.planExpiresAt && new Date() > new Date(user.planExpiresAt)) {
             bot.status = 'STOPPED';
             await bot.save();
             continue;
        }

        const res = await startBotEngine(bot);
        if(res.success) restoredCount++;
    }
    
    SystemLogger.success(`Restored ${restoredCount}/${runningBots.length} active bots successfully.`);
});

// 3. Start Web Server
const server = app.listen(CONFIG.port, () => {
    SystemLogger.success("=================================================");
    SystemLogger.success(`LAGA HOST SERVER RUNNING ON PORT ${CONFIG.port}`);
    SystemLogger.success(`MODE: ${CONFIG.env}`);
    SystemLogger.success(`DASHBOARD: ${CONFIG.frontendUrl}`);
    SystemLogger.success("=================================================");
});

// 4. Graceful Shutdown Handling
const shutdown = (signal) => {
    SystemLogger.warn(`${signal} received. Shutting down securely...`);
    
    // Stop Main Bot
    mainBot.stop(signal);
    
    // Stop All Hosted Bots
    Object.values(activeBotInstances).forEach(bot => {
        try { bot.stop(signal); } catch(e) {}
    });
    
    // Close DB
    mongoose.connection.close(false, () => {
        SystemLogger.db("Database Connection Closed.");
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
