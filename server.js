require('dotenv').config();
const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const cron = require('node-cron');

// --- 1. APP CONFIGURATION ---
const app = express();
const PORT = process.env.PORT || 3000;

// ⚠️ আপনার ওয়েব অ্যাপের লিংক (Frontend URL)
const WEB_APP_URL = "https://laga-host-front.onrender.com"; 

// অ্যাডমিন এবং চ্যানেল কনফিগারেশন
const ADMIN_CONFIG = {
    token: "8353228427:AAHcfw6T-ZArT4J8HUW1TbSa9Utor2RxlLY", 
    chatId: "7605281774", // আপনার Admin Telegram ID
    channels: [
        { name: 'Laga Tech Official', username: '@lagatechofficial', url: 'https://t.me/lagatechofficial' },
        { name: 'Snowman Adventure', username: '@snowmanadventureannouncement', url: 'https://t.me/snowmanadventureannouncement' }
    ]
};

// ডাটাবেস কানেকশন লিংক
const MONGO_URI = "mongodb+srv://lagahost:l%40g%40ho%24t@snowmanadventure.ocodku0.mongodb.net/snowmanadventure?retryWrites=true&w=majority&appName=snowmanadventure";

// --- 2. DATABASE CONNECTION ---
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected Successfully'))
    .catch(err => console.error('❌ DB Connection Error:', err.message));

// --- 3. DATABASE SCHEMAS (MODELS) ---

// A. Main User Schema (যারা আপনার বট ব্যবহার করে তাদের নিজস্ব বট বানাচ্ছে)
const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    username: String,
    firstName: String,
    plan: { type: String, default: 'Free' },
    botLimit: { type: Number, default: 1 }, // Free users can create 1 bot
    referrals: { type: Number, default: 0 },
    referredBy: String,
    planExpiresAt: { type: Date, default: null }, 
    joinedAt: { type: Date, default: Date.now }
});
const UserModel = mongoose.model('User', userSchema);

// B. Bot Instance Schema (তৈরি করা চাইল্ড বটগুলো)
const botSchema = new mongoose.Schema({
    ownerId: { type: String, required: true },
    name: String,
    token: String,
    status: { type: String, default: 'STOPPED' }, 
    commands: { type: Object, default: {} }, // JS Codes stored here
    isFirstLive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});
const BotModel = mongoose.model('Bot', botSchema);

// C. End User Schema (যারা চাইল্ড বটগুলো ব্যবহার করছে - ফর ব্রডকাস্ট)
const endUserSchema = new mongoose.Schema({
    tgId: { type: String, required: true }, // End User Telegram ID
    botId: { type: String, required: true }, // Reference to the Bot ID they are using
    username: String,
    firstName: String,
    createdAt: { type: Date, default: Date.now }
});
// ইনডেক্সিং করা হলো যাতে একই ইউজার একই বটের ডাটাবেসে দুইবার সেভ না হয়
endUserSchema.index({ tgId: 1, botId: 1 }, { unique: true });
const EndUserModel = mongoose.model('EndUser', endUserSchema);

// --- 4. GLOBAL VARIABLES & HELPERS ---
let activeBotInstances = {}; // RAM Storage for running bots to prevent re-login
const mainBot = new Telegraf(ADMIN_CONFIG.token);

// সাবস্ক্রিপশন চেক করার ফাংশন
async function checkSubscription(userId, telegram) {
    for (const channel of ADMIN_CONFIG.channels) {
        try {
            const member = await telegram.getChatMember(channel.username, userId);
            if (['left', 'kicked', 'restricted'].includes(member.status)) {
                return false;
            }
        } catch (e) {
            console.log(`⚠️ Skipping check for ${channel.username} (Bot might not be admin)`);
        }
    }
    return true;
}

// --- 5. CRON JOB (AUTO EXPIRE PLANS) ---
// প্রতিদিন রাত ১২টায় রান হবে
cron.schedule('0 0 * * *', async () => {
    console.log('🔄 Cron Job: Checking Expired Plans...');
    const now = new Date();
    // খুঁজে বের করো যাদের প্ল্যান ফ্রি না এবং মেয়াদ শেষ
    const expiredUsers = await UserModel.find({ 
        plan: { $ne: 'Free' }, 
        planExpiresAt: { $lt: now } 
    });
    
    for (const user of expiredUsers) {
        // ১. ইউজারকে ডাউনগ্রেড করো
        user.plan = 'Free';
        user.botLimit = 1;
        user.planExpiresAt = null;
        await user.save();
        
        // ২. যদি ১টির বেশি বট চালু থাকে, বাকিগুলো স্টপ করো
        const bots = await BotModel.find({ ownerId: user.userId });
        if(bots.length > 1) {
            for(let i=1; i<bots.length; i++) {
                const bId = bots[i]._id.toString();
                // Stop from RAM
                if(activeBotInstances[bId]) {
                    try { activeBotInstances[bId].stop(); } catch(e){}
                    delete activeBotInstances[bId];
                }
                // Update DB Status
                bots[i].status = 'STOPPED';
                await bots[i].save();
            }
        }

        // ৩. ইউজারকে নোটিফিকেশন পাঠাও
        try {
            await mainBot.telegram.sendMessage(user.userId, '⚠️ <b>Plan Expired</b>\nYou have been downgraded to Free plan. Some bots may have stopped.', { parse_mode: 'HTML' });
        } catch(e){}
    }
});

// --- 6. MAIN BOT LOGIC ---

mainBot.command('start', async (ctx) => {
    const args = ctx.message.text.split(' ');
    const referrerId = args[1]; // রেফারাল আইডি ধরা হলো

    let user = await UserModel.findOne({ userId: ctx.from.id.toString() });
    
    // নতুন ইউজার হলে ডাটাবেসে সেভ করো
    if (!user) {
        user = await UserModel.create({
            userId: ctx.from.id.toString(),
            username: ctx.from.username,
            firstName: ctx.from.first_name,
            referredBy: referrerId && referrerId !== ctx.from.id.toString() ? referrerId : null
        });

        // রেফারাল বোনাস হ্যান্ডলিং
        if (user.referredBy) {
            await UserModel.findOneAndUpdate({ userId: user.referredBy }, { $inc: { referrals: 1 } });
            try { 
                await ctx.telegram.sendMessage(user.referredBy, `🎉 <b>New Referral!</b>\n${ctx.from.first_name} joined via your link.`, {parse_mode: 'HTML'}); 
            } catch(e){}
        }
    }

    // বাটন তৈরি
    const buttons = ADMIN_CONFIG.channels.map(ch => [Markup.button.url(`📢 Join ${ch.name}`, ch.url)]);
    buttons.push([Markup.button.webApp('🚀 Open Dashboard', WEB_APP_URL)]);

    await ctx.replyWithHTML(
        `👋 <b>Welcome to Laga Host!</b>\n\n` +
        `Create, Manage & Edit Telegram Bots easily.\n` +
        `Deploy bots that serve thousands of users!\n\n` +
        `👇 <b>Join Channels & Open App:</b>`,
        Markup.inlineKeyboard(buttons)
    );
});

// --- 7. SERVER MIDDLEWARE ---
app.use(cors());
app.use(bodyParser.json({limit: '50mb'})); // বড় কোড সেভ করার জন্য লিমিট বাড়ানো হলো
app.use(express.static(path.join(__dirname, 'public')));

// --- 8. BOT ENGINE (CORE SYSTEM) ---
// এই ফাংশনটি চাইল্ড বটগুলোকে রান করায় এবং ইউজার ডাটা কালেক্ট করে
async function startBotEngine(botDoc) {
    const botId = botDoc._id.toString();

    // যদি অলরেডি রান থাকে তবে আবার রান করার দরকার নেই
    if (activeBotInstances[botId]) {
        return { success: true, message: 'Bot is already running' };
    }

    try {
        const bot = new Telegraf(botDoc.token);
        
        // Error Handler (যাতে সার্ভার ক্র্যাশ না করে)
        bot.catch((err) => {
            console.error(`❌ Bot Error [${botDoc.name}]:`, err);
        });

        if (botDoc.isFirstLive) {
            botDoc.isFirstLive = false;
            await botDoc.save();
        }

        // 🔥 CRITICAL: MIDDLEWARE TO CAPTURE END USERS 🔥
        // যখনই কেউ চাইল্ড বটে মেসেজ দিবে, এই কোডটি রান হবে
        bot.use(async (ctx, next) => {
            if(ctx.from) {
                try {
                    // চেক করি এই ইউজার এই বটের লিস্টে আগে থেকে আছে কি না
                    const exists = await EndUserModel.exists({ tgId: ctx.from.id.toString(), botId: botId });
                    
                    if (!exists) {
                        // না থাকলে সেভ করি
                        await EndUserModel.create({
                            tgId: ctx.from.id.toString(),
                            botId: botId,
                            username: ctx.from.username,
                            firstName: ctx.from.first_name
                        });
                        console.log(`➕ New User captured for Bot: ${botDoc.name}`);
                    }
                } catch(e) {
                    // Duplicate Error Ignore (Silent)
                }
            }
            return next();
        });

        // DYNAMIC COMMAND HANDLER (JS EDITOR)
        bot.on('message', async (ctx) => {
            if (!ctx.message.text) return;
            const text = ctx.message.text;
            
            if (text.startsWith('/')) {
                const cmdName = text.substring(1).split(' ')[0]; // কম্যান্ড নাম বের করা (/start)
                
                // ডাটাবেস থেকে লেটেস্ট কোড আনা
                const freshBot = await BotModel.findById(botId);
                const code = freshBot?.commands?.[cmdName];
                
                if (code) {
                    try {
                        // ইউজার কোড এক্সিকিউট করা (Safe Sandbox)
                        const func = new Function('ctx', 'bot', `
                            try {
                                ${code}
                            } catch(e) {
                                ctx.reply('⚠️ Script Error: ' + e.message);
                            }
                        `);
                        func(ctx, bot);
                    } catch (e) {
                        ctx.reply(`❌ Syntax Error in Command: ${e.message}`);
                    }
                }
            }
        });

        // বট লঞ্চ করা
        await bot.launch({ dropPendingUpdates: true });
        activeBotInstances[botId] = bot; // RAM এ সেভ রাখা
        console.log(`✅ Started Bot: ${botDoc.name}`);
        return { success: true };

    } catch (e) {
        console.error(`❌ Failed to start [${botDoc.name}]:`, e.message);
        return { success: false, message: 'Invalid Token' };
    }
}

// --- 9. API ROUTES (FRONTEND COMMUNICATION) ---

// A. Get User & Bot Data
app.post('/api/bots', async (req, res) => {
    const { userId, username, firstName } = req.body;
    if(!userId) return res.json({ bots: [], user: null });

    let user = await UserModel.findOne({ userId });
    
    // ইউজার সিঙ্ক করা
    if (!user) {
        user = await UserModel.create({ userId, username, firstName });
    } else if(firstName && user.firstName !== firstName) {
        user.firstName = firstName;
        user.username = username;
        await user.save();
    }

    const bots = await BotModel.find({ ownerId: userId }).sort({ createdAt: -1 });
    res.json({ bots, user });
});

// B. Create New Bot
app.post('/api/createBot', async (req, res) => {
    const { token, name, userId } = req.body;
    
    const user = await UserModel.findOne({ userId });
    const count = await BotModel.countDocuments({ ownerId: userId });
    
    if (count >= user.botLimit) {
        return res.json({ success: false, message: `Limit Reached! Upgrade plan.` });
    }
    
    if(!token.includes(':')) {
        return res.json({ success: false, message: 'Invalid Bot Token' });
    }

    const existing = await BotModel.findOne({ token });
    if (existing) {
        return res.json({ success: false, message: 'Token already used by another user!' });
    }

    const newBot = await BotModel.create({ ownerId: userId, name, token });
    res.json({ success: true, bot: newBot });
});

// C. Toggle Bot (Start/Stop)
app.post('/api/toggleBot', async (req, res) => {
    const { botId, action } = req.body;
    const bot = await BotModel.findById(botId);
    
    if(!bot) return res.json({ success: false, message: 'Bot not found' });

    if (action === 'start') {
        const result = await startBotEngine(bot);
        if (result.success) {
            bot.status = 'RUNNING';
            await bot.save();
            res.json({ success: true });
        } else {
            res.json({ success: false, message: result.message });
        }
    } else {
        // Stop Logic
        if (activeBotInstances[botId]) {
            try { activeBotInstances[botId].stop(); } catch(e) {}
            delete activeBotInstances[botId];
        }
        bot.status = 'STOPPED';
        await bot.save();
        res.json({ success: true });
    }
});

// D. Delete Bot
app.post('/api/deleteBot', async (req, res) => {
    const { botId } = req.body;
    
    if (activeBotInstances[botId]) {
        try { activeBotInstances[botId].stop(); } catch(e){}
        delete activeBotInstances[botId];
    }
    
    await BotModel.findByIdAndDelete(botId);
    // ওই বটের সব End User ডাটাও ডিলিট করা হচ্ছে (ক্লিনআপ)
    await EndUserModel.deleteMany({ botId: botId }); 
    
    res.json({ success: true });
});

// E. JS Editor APIs
app.post('/api/getCommands', async (req, res) => {
    const bot = await BotModel.findById(req.body.botId);
    res.json(bot ? bot.commands : {});
});

app.post('/api/saveCommand', async (req, res) => {
    const { botId, command, code } = req.body;
    const cleanCmd = command.replace('/', '').trim();
    await BotModel.findByIdAndUpdate(botId, { $set: { [`commands.${cleanCmd}`]: code } });
    res.json({ success: true });
});

app.post('/api/deleteCommand', async (req, res) => {
    const { botId, command } = req.body;
    await BotModel.findByIdAndUpdate(botId, { $unset: { [`commands.${command}`]: "" } });
    res.json({ success: true });
});

// F. Payment System
app.post('/api/submit-payment', async (req, res) => {
    const { trxId, plan, amount, userId, user, method } = req.body;

    // Referral Payment
    if (method === 'referral') {
        const dbUser = await UserModel.findOne({ userId });
        const required = plan === 'Pro' ? 50 : 80;
        
        if (dbUser.referrals < required) {
            return res.json({ success: false, message: `Need ${required} Referrals!` });
        }
        
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 30);
        
        dbUser.plan = plan;
        dbUser.botLimit = plan === 'Pro' ? 5 : 10;
        dbUser.planExpiresAt = expiry;
        dbUser.referrals -= required;
        await dbUser.save();
        
        return res.json({ success: true, message: 'Upgraded with Points! 🎉' });
    }

    // Manual Payment (Admin Verify)
    try {
        await mainBot.telegram.sendMessage(ADMIN_CONFIG.chatId, 
            `💰 <b>NEW PAYMENT</b>\n\n` +
            `👤 User: @${user} (<code>${userId}</code>)\n` +
            `💎 Plan: <b>${plan}</b>\n` +
            `💵 Amount: ${amount}৳\n` +
            `🧾 TrxID: <code>${trxId}</code>`,
            { 
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '✅ Approve', callback_data: `approve:${userId}:${plan}` }, 
                        { text: '❌ Decline', callback_data: `decline:${userId}` }
                    ]]
                }
            }
        );
        res.json({ success: true, message: 'Submitted for Review!' });
    } catch(e) { 
        res.json({ success: false, message: 'Admin Bot Error' }); 
    }
});

// 🔥 G. GLOBAL BROADCAST SYSTEM (Your Requirement) 🔥
app.post('/api/broadcast', async (req, res) => {
    const { message, adminId } = req.body;
    
    // Security Check
    if (adminId !== ADMIN_CONFIG.chatId) return res.json({ success: false, message: 'Forbidden' });

    let totalSent = 0;

    // ১. মেইন প্ল্যাটফর্মের ইউজারদের পাঠানো
    const mainUsers = await UserModel.find({});
    mainUsers.forEach((u, i) => {
        setTimeout(async () => {
            try {
                await mainBot.telegram.sendMessage(u.userId, `📢 <b>Announcement</b>\n\n${message}`, { parse_mode: 'HTML' });
            } catch(e) {}
        }, i * 100);
        totalSent++;
    });

    // ২. চাইল্ড বটের ইউজারদের পাঠানো (END USERS)
    // সব বট লোড করি
    const allBots = await BotModel.find({});

    for (const bot of allBots) {
        // যদি বটের টোকেন না থাকে, স্কিপ
        if(!bot.token) continue;

        // এই বটের সব ইউজারকে ডাটাবেস থেকে খুঁজি
        const endUsers = await EndUserModel.find({ botId: bot._id.toString() });
        if(endUsers.length === 0) continue;

        // মেসেজ পাঠানোর জন্য বটের ইন্সট্যান্স রেডি করি
        // যদি বট অলরেডি রান থাকে, সেটি ব্যবহার করি। না হলে নতুন বানাই।
        let senderBot = activeBotInstances[bot._id.toString()];
        if (!senderBot) {
            try { senderBot = new Telegraf(bot.token); } catch(e) { continue; }
        }

        // লুপ চালিয়ে মেসেজ সেন্ড
        endUsers.forEach((eu, index) => {
            setTimeout(async () => {
                try {
                    await senderBot.telegram.sendMessage(eu.tgId, `📢 <b>Global Broadcast</b>\n\n${message}`, { parse_mode: 'HTML' });
                } catch(e) {
                    // যদি ইউজার ব্লক করে দেয়, ডাটাবেস থেকে ডিলিট করে দিই (ক্লিনআপ)
                    if(e.code === 403) {
                        await EndUserModel.findByIdAndDelete(eu._id);
                    }
                }
            }, index * 200 + (mainUsers.length * 100)); // মেইন ইউজারদের শেষ হওয়ার পর শুরু হবে
            totalSent++;
        });
    }

    res.json({ success: true, total: totalSent });
});

// --- 10. ADMIN CALLBACK ACTIONS ---
mainBot.action(/^approve:(\d+):(\w+)$/, async (ctx) => {
    const userId = ctx.match[1];
    const plan = ctx.match[2];
    const limits = { 'Pro': 5, 'VIP': 10 };
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 30);

    await UserModel.findOneAndUpdate(
        { userId }, 
        { plan, botLimit: limits[plan], planExpiresAt: expiry }
    );
    
    await ctx.editMessageText(`✅ Approved ${plan} for ${userId}`);
    try { await mainBot.telegram.sendMessage(userId, `✅ <b>Payment Accepted!</b>\nYou are now on <b>${plan}</b> plan.`, { parse_mode: 'HTML' }); } catch(e){}
});

mainBot.action(/^decline:(\d+)$/, async (ctx) => {
    const userId = ctx.match[1];
    await ctx.editMessageText(`❌ Declined`);
    try { await mainBot.telegram.sendMessage(userId, `❌ <b>Payment Declined</b>\nInvalid Transaction ID.`, { parse_mode: 'HTML' }); } catch(e){}
});

// --- 11. STARTUP SEQUENCE ---

// মেইন বট স্টার্ট
mainBot.launch({ dropPendingUpdates: true })
    .then(() => console.log('🤖 Main Bot Started'))
    .catch((err) => console.error('❌ Main Bot Error:', err));

// সার্ভার রিস্টার্ট হলে চালু থাকা বটগুলো আবার রান করানো
mongoose.connection.once('open', async () => {
    console.log('🔄 Restoring active bots...');
    const runningBots = await BotModel.find({ status: 'RUNNING' });
    if(runningBots.length > 0) {
        for (const bot of runningBots) {
            await startBotEngine(bot);
        }
        console.log(`🚀 Restored ${runningBots.length} bots.`);
    }
});

// গ্রেসফুল শাটডাউন
process.once('SIGINT', () => mainBot.stop('SIGINT'));
process.once('SIGTERM', () => mainBot.stop('SIGTERM'));

// ফ্রন্টএন্ড সার্ভ করা
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
