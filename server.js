require('dotenv').config();
const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

// --- CONFIGURATION ---
const ADMIN_CONFIG = {
    token: "8353228427:AAHcfw6T-ZArT4J8HUW1TbSa9Utor2RxlLY", 
    chatId: "7605281774",
    channels: ['@lagatechofficial', '@snowmanadventureannouncement'] // Bot must be admin here
};

const MONGO_URI = "mongodb+srv://lagahost:l%40g%40ho%24t@snowmanadventure.ocodku0.mongodb.net/snowmanadventure?retryWrites=true&w=majority&appName=snowmanadventure";

// --- DATABASE ---
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ DB Error:', err.message));

// --- SCHEMAS ---
const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    username: String,
    firstName: String,
    plan: { type: String, default: 'Free' },
    botLimit: { type: Number, default: 1 },
    referrals: { type: Number, default: 0 },
    referredBy: String,
    planExpiresAt: { type: Date, default: null }, // Null means lifetime (Free) or expired
    joinedAt: { type: Date, default: Date.now }
});
const UserModel = mongoose.model('User', userSchema);

const botSchema = new mongoose.Schema({
    ownerId: { type: String, required: true },
    name: String,
    token: String,
    status: { type: String, default: 'STOPPED' },
    commands: { type: Object, default: {} },
    isFirstLive: { type: Boolean, default: true }, // To track first run
    createdAt: { type: Date, default: Date.now }
});
const BotModel = mongoose.model('Bot', botSchema);

// Memory Storage
let activeBotInstances = {};
const mainBot = new Telegraf(ADMIN_CONFIG.token);

// --- HELPER FUNCTIONS ---
const getMention = (ctx) => `<a href="tg://user?id=${ctx.from.id}">${ctx.from.first_name}</a>`;

// Check Subscription
async function checkSubscription(ctx) {
    for (const channel of ADMIN_CONFIG.channels) {
        try {
            const member = await ctx.telegram.getChatMember(channel, ctx.from.id);
            if (['left', 'kicked'].includes(member.status)) return false;
        } catch (e) {
            console.log(`Skipping channel check for ${channel} (Bot likely not admin)`);
            // In production, return false if strict, true if loose
        }
    }
    return true;
}

// Plan Expiry Checker (Runs daily)
cron.schedule('0 0 * * *', async () => {
    const expiredUsers = await UserModel.find({ 
        plan: { $ne: 'Free' }, 
        planExpiresAt: { $lt: new Date() } 
    });
    
    for (const user of expiredUsers) {
        user.plan = 'Free';
        user.botLimit = 1;
        user.planExpiresAt = null;
        await user.save();
        try {
            await mainBot.telegram.sendMessage(user.userId, '⚠️ <b>Your Plan has Expired!</b>\nYou are now on the Free tier.', { parse_mode: 'HTML' });
        } catch(e){}
    }
});

// --- MAIN BOT LOGIC (LagaHostBot) ---

// Start Command (Referral & Force Sub)
mainBot.command('start', async (ctx) => {
    const args = ctx.message.text.split(' ');
    const referrerId = args[1];

    // Create User if not exists
    let user = await UserModel.findOne({ userId: ctx.from.id.toString() });
    if (!user) {
        user = await UserModel.create({
            userId: ctx.from.id.toString(),
            username: ctx.from.username,
            firstName: ctx.from.first_name,
            referredBy: referrerId && referrerId !== ctx.from.id.toString() ? referrerId : null
        });

        // Increment Referrer Count
        if (user.referredBy) {
            await UserModel.findOneAndUpdate({ userId: user.referredBy }, { $inc: { referrals: 1 } });
            try { await ctx.telegram.sendMessage(user.referredBy, `🎉 <b>New Referral!</b>\n${ctx.from.first_name} joined using your link.`, {parse_mode: 'HTML'}); } catch(e){}
        }
    }

    // Force Subscribe Message
    const mention = getMention(ctx);
    await ctx.replyWithHTML(
        `👋 Hey ${mention}\n\n` +
        `তোমার বোট লাইভ করতে হলে আগে নিচের চ্যানেলগুলো সাবস্ক্রাইব করতে হবে।\n\n` +
        `✅ সব চ্যানেল সাবস্ক্রাইব করার পর\n` +
        `👉 “Check” বাটনে ক্লিক করো\n\n` +
        `তারপরই তোমার বোট ২৪/৭ লাইভ হয়ে যাবে 🚀\n` +
        `${ADMIN_CONFIG.channels.join('\n')}`,
        Markup.inlineKeyboard([Markup.button.callback('🔍 Check', 'check_sub')])
    );
});

// Check Subscription Callback
mainBot.action('check_sub', async (ctx) => {
    await ctx.answerCbQuery('🔍 Checking subscription...');
    const isSubscribed = await checkSubscription(ctx);
    const mention = getMention(ctx);

    if (isSubscribed) {
        // Success Step 1
        await ctx.editMessageText(
            `✅ অভিনন্দন ${mention}\n` +
            `তুমি সব চ্যানেল সাবস্ক্রাইব করেছো।\n\n` +
            `🚀 এখন তোমার বোট ২৪/৭ লাইভ আছে\n` +
            `শুভকামনা!`, 
            { parse_mode: 'HTML' }
        );

        // Delay 2 Seconds then Final Message
        setTimeout(async () => {
            try {
                await ctx.deleteMessage(); // Remove congratulations msg
                await ctx.replyWithHTML(
                    `🎉 Congratulations ${mention}!\n\n` +
                    `সব স্টেপ সফলভাবে কমপ্লিট হয়েছে ✅\n` +
                    `এখন তোমার বোট পুরোপুরি অ্যাক্টিভ।\n\n` +
                    `🗳️ বোট ২৪/৭ লাইভ থাকবে\n` +
                    `যেকোনো সময় শেয়ার করতে পারো।\n\n` +
                    `ধন্যবাদ আমাদের সাথে থাকার জন্য 💙`
                );

                // Permanent Dashboard Menu
                await ctx.replyWithHTML(
                    `👋 Welcome ${mention}!\n\n` +
                    `তোমার বট ২৪/৭ লাইভ করার জন্য\n` +
                    `নিচের **Dashboard** বাটনে ক্লিক করো।\n\n` +
                    `ড্যাশবোর্ড থেকে তুমি\n` +
                    `⚙️ বট সেটআপ করতে পারবে\n` +
                    `📊 স্ট্যাটাস চেক করতে পারবে\n` +
                    `🗳️ বোট ম্যানেজ করতে পারবে\n\n` +
                    `সবকিছু সহজ, দ্রুত আর সিকিউর 🚀\n` +
                    `শুরু করতে Dashboard এ যাও।`,
                    Markup.inlineKeyboard([
                        [Markup.button.webApp('🚀 Dashboard', 'https://lagahost.onrender.com')], // Replace with your URL
                        [Markup.button.callback('📊 Status', 'my_status'), Markup.button.callback('👥 Refer', 'my_refer')]
                    ])
                );
            } catch(e) { console.log(e); }
        }, 2000);

    } else {
        // Failed
        await ctx.editMessageText(
            `❌ Sorry ${mention}\n\n` +
            `তুমি এখনও সব চ্যানেল সাবস্ক্রাইব করোনি।\n\n` +
            `👉 অনুগ্রহ করে সব চ্যানেল সাবস্ক্রাইব করে\n` +
            `তারপর আবার “Check” বাটনে ক্লিক করো।`,
            { 
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([Markup.button.callback('🔍 Check', 'check_sub')])
            }
        );
    }
});

// Status Button
mainBot.action('my_status', async (ctx) => {
    const user = await UserModel.findOne({ userId: ctx.from.id.toString() });
    const expiry = user.planExpiresAt ? new Date(user.planExpiresAt).toLocaleDateString() : 'Lifetime';
    await ctx.replyWithHTML(
        `📊 <b>Your Status</b>\n\n` +
        `👤 User: ${getMention(ctx)}\n` +
        `💎 Plan: <b>${user.plan}</b>\n` +
        `🤖 Bot Limit: <b>${user.botLimit}</b>\n` +
        `⏳ Expires: <b>${expiry}</b>\n` +
        `👥 Referrals: <b>${user.referrals}</b>`
    );
});

// Refer Button
mainBot.action('my_refer', async (ctx) => {
    const link = `https://t.me/lagahostbot?start=${ctx.from.id}`;
    const user = await UserModel.findOne({ userId: ctx.from.id.toString() });
    await ctx.replyWithHTML(
        `👥 <b>Referral Program</b>\n\n` +
        `Your Refer Link:\n<code>${link}</code>\n\n` +
        `Total Refers: <b>${user.referrals}</b>\n\n` +
        `🎁 <b>Rewards:</b>\n` +
        `- 50 Refers = Pro Plan (Free)\n` +
        `- 80 Refers = VIP Plan (Free)`
    );
});

// --- ADMIN APPROVAL SYSTEM ---
mainBot.action(/^approve:(\d+):(\w+)$/, async (ctx) => {
    const userId = ctx.match[1];
    const plan = ctx.match[2];
    const limits = { 'Free': 1, 'Pro': 5, 'VIP': 10 };
    
    // Set 30 Days Expiry
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);

    try {
        await UserModel.findOneAndUpdate(
            { userId }, 
            { 
                $set: { 
                    plan, 
                    botLimit: limits[plan],
                    planExpiresAt: expiryDate 
                } 
            },
            { upsert: true }
        );
        
        await ctx.editMessageText(
            `✅ <b>Approved!</b>\n` +
            `👤 User: ${userId}\n` +
            `💎 Plan: ${plan}\n` +
            `📅 Expires: ${expiryDate.toLocaleDateString()}`,
            { parse_mode: 'HTML' }
        );

        try { await mainBot.telegram.sendMessage(userId, `✅ Your plan upgraded to <b>${plan}</b>!\nValid until: ${expiryDate.toLocaleDateString()}`, { parse_mode: 'HTML' }); } catch(e){}
    } catch(e) { console.log(e); }
});

mainBot.action(/^decline:(\d+)$/, async (ctx) => {
    await ctx.editMessageText(`❌ Request Declined`);
    try { await mainBot.telegram.sendMessage(ctx.match[1], `❌ Your payment request was declined.`); } catch(e){}
});

mainBot.launch();

// --- SERVER MIDDLEWARE ---
app.use(cors());
app.use(bodyParser.json({limit: '50mb'}));
app.use(express.static(path.join(__dirname, 'public')));

// --- BOT ENGINE (USER BOTS) ---
async function startBotEngine(botDoc) {
    const botId = botDoc._id.toString();

    // 1. Force Stop & Clean
    if (activeBotInstances[botId]) {
        try { activeBotInstances[botId].stop(); } catch(e){}
        delete activeBotInstances[botId];
    }

    try {
        const bot = new Telegraf(botDoc.token);
        try { await bot.telegram.deleteWebhook({ drop_pending_updates: true }); } catch(e){}

        // 2. First Run Message Logic
        if (botDoc.isFirstLive) {
            botDoc.isFirstLive = false;
            await botDoc.save();

            // Send to Owner via the created bot
            try {
                const ownerLink = `<a href="tg://user?id=${botDoc.ownerId}">Owner</a>`;
                await bot.telegram.sendMessage(botDoc.ownerId, 
                    `🎉 Congratulations ${ownerLink}!\n\n` +
                    `Your bot is live now 🚀\n` +
                    `সব সেটআপ সফলভাবে সম্পন্ন হয়েছে।\n\n` +
                    `⚡ এখন তোমার বোট ২৪/৭ চলবে\n` +
                    `যেকোনো সময় ব্যবহার ও শেয়ার করতে পারো।\n\n` +
                    `ধন্যবাদ আমাদের প্ল্যাটফর্ম ব্যবহার করার জন্য 💙`,
                    { parse_mode: 'HTML' }
                );
            } catch (e) { console.log("Could not send first run msg (User hasn't started bot yet)"); }
        }

        // 3. Command Handler
        bot.on('message', async (ctx) => {
            if (!ctx.message.text) return;
            const text = ctx.message.text;
            
            if (text.startsWith('/')) {
                const cmdName = text.substring(1).split(' ')[0];
                const freshData = await BotModel.findById(botId);
                const code = freshData?.commands?.[cmdName];
                
                if (code) {
                    try {
                        const func = new Function('ctx', code);
                        func(ctx);
                    } catch (e) { ctx.reply(`❌ Code Error: ${e.message}`); }
                }
            }
        });

        await bot.launch({ dropPendingUpdates: true });
        activeBotInstances[botId] = bot;
        return { success: true };

    } catch (e) {
        if(e.code === 409) return { success: false, message: 'Conflict: Restarting...' };
        return { success: false, message: e.message };
    }
}

// Restore Logic
mongoose.connection.once('open', async () => {
    setTimeout(async () => {
        const runningBots = await BotModel.find({ status: 'RUNNING' });
        for (const bot of runningBots) await startBotEngine(bot);
    }, 3000);
});

// --- API ROUTES ---

// Get User & Bots (Syncs Plan)
app.get('/api/bots', async (req, res) => {
    const { userId, username, firstName } = req.query;
    if(!userId) return res.json([]);

    let user = await UserModel.findOne({ userId });
    
    // Check Expiry on Load
    if (user && user.plan !== 'Free' && user.planExpiresAt && new Date() > new Date(user.planExpiresAt)) {
        user.plan = 'Free';
        user.botLimit = 1;
        user.planExpiresAt = null;
        await user.save();
    }

    if (!user) {
        user = await UserModel.create({ userId, username, firstName });
    }

    const bots = await BotModel.find({ ownerId: userId }).sort({ createdAt: -1 });
    res.json({ bots, user }); // Return both bots and user info
});

app.post('/api/createBot', async (req, res) => {
    const { token, name, userId } = req.body;
    const user = await UserModel.findOne({ userId });
    const count = await BotModel.countDocuments({ ownerId: userId });
    
    if (count >= user.botLimit) return res.json({ success: false, message: 'Plan Limit Reached!' });
    if (await BotModel.findOne({ token })) return res.json({ success: false, message: 'Token already used!' });

    const newBot = await BotModel.create({ ownerId: userId, name, token, status: 'STOPPED' });
    res.json({ success: true, bot: newBot });
});

app.post('/api/toggleBot', async (req, res) => {
    const { botId, action } = req.body;
    const bot = await BotModel.findById(botId);
    
    if (action === 'start') {
        const result = await startBotEngine(bot);
        if (result.success) {
            bot.status = 'RUNNING';
            await bot.save();
            res.json({ success: true }); // Frontend will update UI immediately
        } else {
            res.json({ success: false, message: result.message });
        }
    } else {
        if (activeBotInstances[botId]) {
            activeBotInstances[botId].stop();
            delete activeBotInstances[botId];
        }
        bot.status = 'STOPPED';
        await bot.save();
        res.json({ success: true });
    }
});

// Command Routes
app.post('/api/getCommands', async (req, res) => {
    const bot = await BotModel.findById(req.body.botId);
    res.json(bot ? bot.commands : {});
});

app.post('/api/saveCommand', async (req, res) => {
    const { botId, command, code } = req.body;
    const clean = command.replace('/', '').trim();
    await BotModel.findByIdAndUpdate(botId, { $set: { [`commands.${clean}`]: code } });
    res.json({ success: true });
});

app.post('/api/deleteCommand', async (req, res) => {
    const { botId, command } = req.body;
    await BotModel.findByIdAndUpdate(botId, { $unset: { [`commands.${command}`]: "" } });
    res.json({ success: true });
});

app.post('/api/deleteBot', async (req, res) => {
    const { botId } = req.body;
    if (activeBotInstances[botId]) activeBotInstances[botId].stop();
    await BotModel.findByIdAndDelete(botId);
    res.json({ success: true });
});

// Broadcast
app.post('/api/broadcast', async (req, res) => {
    const { message, adminId } = req.body;
    if (adminId !== ADMIN_CONFIG.chatId) return res.json({ success: false, message: 'Unauthorized' });

    const users = await UserModel.find({});
    let sent = 0;
    
    users.forEach((u, i) => {
        setTimeout(async () => {
            try {
                await mainBot.telegram.sendMessage(u.userId, `📢 <b>Announcement</b>\n\n${message}`, { parse_mode: 'HTML' });
                sent++;
            } catch(e) {}
        }, i * 100); // 100ms delay to prevent flood
    });

    res.json({ success: true, total: users.length });
});

// Payment & Referral Unlock
app.post('/api/submit-payment', async (req, res) => {
    const { trxId, plan, amount, user, userId, method } = req.body;

    if (method === 'referral') {
        const dbUser = await UserModel.findOne({ userId });
        const required = plan === 'Pro' ? 50 : 80;
        
        if (dbUser.referrals < required) return res.json({ success: false, message: `Need ${required} referrals!` });
        
        // Auto Upgrade
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 30);
        dbUser.plan = plan;
        dbUser.botLimit = plan === 'Pro' ? 5 : 10;
        dbUser.planExpiresAt = expiryDate;
        dbUser.referrals -= required; // Deduct used referrals
        await dbUser.save();
        
        return res.json({ success: true, message: 'Plan Upgraded via Referrals!' });
    }

    // Cash Payment
    try {
        await mainBot.telegram.sendMessage(ADMIN_CONFIG.chatId, 
            `💰 <b>Payment</b>\nUser: @${user} (${userId})\nPlan: ${plan}\nTk: ${amount}\nTrxID: <code>${trxId}</code>`,
            { 
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[{ text: '✅ Approve', callback_data: `approve:${userId}:${plan}` }, { text: '❌ Decline', callback_data: `decline:${userId}` }]]
                }
            }
        );
        res.json({ success: true });
    } catch(e) { res.json({ success: false, message: 'Admin Error' }); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
