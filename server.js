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

// ⚠️ IMPORTANT: এখানে আপনার Render বা Hosting এর ডাইরেক্ট লিংক দিন (t.me লিংক দেবেন না)
// উদাহরণ: "https://laga-host.onrender.com"
const WEB_APP_URL = "https://laga-host-ultimate.onrender.com"; 

// --- CONFIGURATION ---
const ADMIN_CONFIG = {
    token: "8353228427:AAHcfw6T-ZArT4J8HUW1TbSa9Utor2RxlLY", 
    chatId: "7605281774", // Admin ID
    channels: [
        { name: 'Laga Tech Official', username: '@lagatechofficial', url: 'https://t.me/lagatechofficial' },
        { name: 'Snowman Adventure', username: '@snowmanadventureannouncement', url: 'https://t.me/snowmanadventureannouncement' }
    ]
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
    planExpiresAt: { type: Date, default: null }, 
    joinedAt: { type: Date, default: Date.now }
});
const UserModel = mongoose.model('User', userSchema);

const botSchema = new mongoose.Schema({
    ownerId: { type: String, required: true },
    name: String,
    token: String,
    status: { type: String, default: 'STOPPED' }, 
    commands: { type: Object, default: {} },
    isFirstLive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});
const BotModel = mongoose.model('Bot', botSchema);

// Memory Storage
let activeBotInstances = {};
const mainBot = new Telegraf(ADMIN_CONFIG.token);

// --- HELPER FUNCTIONS ---
const getMention = (ctx) => `<a href="tg://user?id=${ctx.from.id}">${ctx.from.first_name}</a>`;

// Strict Membership Check
async function checkSubscription(userId, telegram) {
    for (const channel of ADMIN_CONFIG.channels) {
        try {
            const member = await telegram.getChatMember(channel.username, userId);
            // Member status check
            if (['left', 'kicked', 'restricted'].includes(member.status)) {
                return false;
            }
        } catch (e) {
            console.log(`⚠️ Skipping check for ${channel.username} (Bot needs to be Admin there)`);
            // যদি বোট চ্যানেলে এডমিন না থাকে, তাহলে বাইপাস করবে না এরর দেবে?
            // আপাতত বাইপাস করা হলো যাতে ইউজাররা আটকে না যায়। স্ট্রিক্ট করতে চাইলে 'return false' দিন।
        }
    }
    return true;
}

// Cron Job: Check Expired Plans
cron.schedule('0 0 * * *', async () => {
    const now = new Date();
    const expiredUsers = await UserModel.find({ 
        plan: { $ne: 'Free' }, 
        planExpiresAt: { $lt: now } 
    });
    
    for (const user of expiredUsers) {
        user.plan = 'Free';
        user.botLimit = 1;
        user.planExpiresAt = null;
        await user.save();
        
        const bots = await BotModel.find({ ownerId: user.userId });
        if(bots.length > 1) {
            for(let i=1; i<bots.length; i++) {
                if(activeBotInstances[bots[i]._id]) activeBotInstances[bots[i]._id].stop();
                bots[i].status = 'STOPPED';
                await bots[i].save();
            }
        }

        try {
            await mainBot.telegram.sendMessage(user.userId, '⚠️ <b>Plan Expired</b>\nYou have been downgraded to Free plan.', { parse_mode: 'HTML' });
        } catch(e){}
    }
});

// --- MAIN BOT LOGIC ---

mainBot.command('start', async (ctx) => {
    const args = ctx.message.text.split(' ');
    const referrerId = args[1];

    let user = await UserModel.findOne({ userId: ctx.from.id.toString() });
    if (!user) {
        user = await UserModel.create({
            userId: ctx.from.id.toString(),
            username: ctx.from.username,
            firstName: ctx.from.first_name,
            referredBy: referrerId && referrerId !== ctx.from.id.toString() ? referrerId : null
        });

        if (user.referredBy) {
            await UserModel.findOneAndUpdate({ userId: user.referredBy }, { $inc: { referrals: 1 } });
            try { await ctx.telegram.sendMessage(user.referredBy, `🎉 <b>New Referral!</b>\n${ctx.from.first_name} joined via your link.`, {parse_mode: 'HTML'}); } catch(e){}
        }
    } else {
        user.firstName = ctx.from.first_name;
        user.username = ctx.from.username;
        await user.save();
    }

    const buttons = ADMIN_CONFIG.channels.map(ch => [Markup.button.url(`📢 Join ${ch.name}`, ch.url)]);
    buttons.push([Markup.button.callback('✅ Verify & Start', 'check_sub')]);

    await ctx.replyWithHTML(
        `👋 <b>Welcome ${ctx.from.first_name}!</b>\n\n` +
        `To use <b>Laga Host Ultimate</b>, you must join our official channels first.\n\n` +
        `👇 Join below then click Verify:`,
        Markup.inlineKeyboard(buttons)
    );
});

mainBot.action('check_sub', async (ctx) => {
    const isJoined = await checkSubscription(ctx.from.id, ctx.telegram);
    
    if (isJoined) {
        try {
            await ctx.deleteMessage(); // Delete previous "Join" message
        } catch(e) {}

        await ctx.replyWithHTML(
            `✅ <b>Verified Successfully!</b>\n\n` +
            `Welcome to the ultimate Telegram Bot Hosting platform.\n` +
            `Deploy, Manage & Edit your bots 24/7.\n\n` +
            `👇 <b>Click below to open Dashboard:</b>`,
            Markup.inlineKeyboard([
                // FIX: Using actual HTTPS URL, not t.me link
                [Markup.button.webApp('🚀 Open Dashboard', WEB_APP_URL)],
                [Markup.button.callback('👤 Profile', 'my_status'), Markup.button.callback('💰 Plans', 'my_plans')]
            ])
        );
    } else {
        await ctx.answerCbQuery('❌ You are not joined yet!', { show_alert: true });
    }
});

mainBot.action('my_status', async (ctx) => {
    const user = await UserModel.findOne({ userId: ctx.from.id.toString() });
    const expiry = user.planExpiresAt 
        ? new Date(user.planExpiresAt).toLocaleDateString() 
        : 'Lifetime (Free)';
        
    await ctx.replyWithHTML(
        `👤 <b>User Profile</b>\n` +
        `🆔 ID: <code>${user.userId}</code>\n` +
        `💎 Plan: <b>${user.plan}</b>\n` +
        `⏳ Expiry: ${expiry}\n` +
        `🤖 Bots: ${user.botLimit}\n` +
        `👥 Referrals: ${user.referrals}`
    );
});

mainBot.action('my_plans', async (ctx) => {
    await ctx.replyWithHTML(
        `💎 <b>Premium Plans</b>\n\n` +
        `1️⃣ <b>PRO (50৳ / 50 Refs)</b>\n` +
        `- 5 Bots Limit\n- Priority Support\n- 30 Days Validity\n\n` +
        `2️⃣ <b>VIP (80৳ / 80 Refs)</b>\n` +
        `- 10 Bots Limit\n- 24/7 Uptime\n- 30 Days Validity\n\n` +
        `<i>Go to Dashboard to upgrade!</i>`
    );
});

// Admin Actions
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
    try { await mainBot.telegram.sendMessage(userId, `✅ Payment Accepted! You are now on <b>${plan}</b> plan.\nExpires: ${expiry.toLocaleDateString()}`, { parse_mode: 'HTML' }); } catch(e){}
});

mainBot.action(/^decline:(\d+)$/, async (ctx) => {
    await ctx.editMessageText(`❌ Declined request for ${ctx.match[1]}`);
    try { await mainBot.telegram.sendMessage(ctx.match[1], `❌ Your payment request was declined.`); } catch(e){}
});

mainBot.launch();

// --- SERVER MIDDLEWARE ---
app.use(cors());
app.use(bodyParser.json({limit: '50mb'}));
app.use(express.static(path.join(__dirname, 'public')));

// --- BOT ENGINE ---
async function startBotEngine(botDoc) {
    const botId = botDoc._id.toString();

    if (activeBotInstances[botId]) {
        try { activeBotInstances[botId].stop(); } catch(e){}
        delete activeBotInstances[botId];
    }

    try {
        const bot = new Telegraf(botDoc.token);
        try { await bot.telegram.deleteWebhook({ drop_pending_updates: true }); } catch(e){}

        if (botDoc.isFirstLive) {
            botDoc.isFirstLive = false;
            await botDoc.save();
            try {
                await bot.telegram.sendMessage(botDoc.ownerId, "🚀 Your bot is successfully deployed and running!");
            } catch (e) {}
        }

        bot.on('message', async (ctx) => {
            if (!ctx.message.text) return;
            const text = ctx.message.text;
            
            if (text.startsWith('/')) {
                const cmdName = text.substring(1).split(' ')[0];
                const freshBot = await BotModel.findById(botId);
                const code = freshBot?.commands?.[cmdName];
                
                if (code) {
                    try {
                        const func = new Function('ctx', 'bot', `
                            try {
                                ${code}
                            } catch(e) {
                                ctx.reply('⚠️ Script Error: ' + e.message);
                            }
                        `);
                        func(ctx, bot);
                    } catch (e) {
                        ctx.reply(`❌ Syntax Error: ${e.message}`);
                    }
                }
            }
        });

        await bot.launch({ dropPendingUpdates: true });
        activeBotInstances[botId] = bot;
        return { success: true };

    } catch (e) {
        console.error(`Start Error [${botDoc.name}]:`, e.message);
        return { success: false, message: e.message };
    }
}

mongoose.connection.once('open', async () => {
    console.log('🔄 Restarting active bots...');
    const runningBots = await BotModel.find({ status: 'RUNNING' });
    for (const bot of runningBots) {
        await startBotEngine(bot);
    }
});

// --- API ROUTES ---

app.post('/api/bots', async (req, res) => {
    const { userId, username, firstName } = req.body;
    if(!userId) return res.json({ bots: [], user: null });

    let user = await UserModel.findOne({ userId });
    
    if (!user) {
        user = await UserModel.create({ userId, username, firstName });
    } else if(firstName && user.firstName !== firstName) {
        user.firstName = firstName;
        user.username = username;
        await user.save();
    }

    if (user.plan !== 'Free' && user.planExpiresAt && new Date() > new Date(user.planExpiresAt)) {
        user.plan = 'Free';
        user.botLimit = 1;
        user.planExpiresAt = null;
        await user.save();
    }

    const bots = await BotModel.find({ ownerId: userId }).sort({ createdAt: -1 });
    res.json({ bots, user });
});

app.post('/api/createBot', async (req, res) => {
    const { token, name, userId } = req.body;
    const user = await UserModel.findOne({ userId });
    const count = await BotModel.countDocuments({ ownerId: userId });
    
    if (count >= user.botLimit) return res.json({ success: false, message: 'Upgrade plan to create more!' });
    if(!token.includes(':')) return res.json({ success: false, message: 'Invalid Bot Token' });
    if (await BotModel.findOne({ token })) return res.json({ success: false, message: 'Token already in use!' });

    const newBot = await BotModel.create({ ownerId: userId, name, token });
    res.json({ success: true, bot: newBot });
});

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
        if (activeBotInstances[botId]) {
            activeBotInstances[botId].stop();
            delete activeBotInstances[botId];
        }
        bot.status = 'STOPPED';
        await bot.save();
        res.json({ success: true });
    }
});

app.post('/api/deleteBot', async (req, res) => {
    const { botId } = req.body;
    if (activeBotInstances[botId]) {
        activeBotInstances[botId].stop();
        delete activeBotInstances[botId];
    }
    await BotModel.findByIdAndDelete(botId);
    res.json({ success: true });
});

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

app.post('/api/submit-payment', async (req, res) => {
    const { trxId, plan, amount, userId, user, method } = req.body;

    if (method === 'referral') {
        const dbUser = await UserModel.findOne({ userId });
        const required = plan === 'Pro' ? 50 : 80;
        
        if (dbUser.referrals < required) return res.json({ success: false, message: `Need ${required} referrals!` });
        
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 30);
        
        dbUser.plan = plan;
        dbUser.botLimit = plan === 'Pro' ? 5 : 10;
        dbUser.planExpiresAt = expiry;
        dbUser.referrals -= required;
        await dbUser.save();
        
        return res.json({ success: true, message: 'Upgraded with Points! 🎉' });
    }

    try {
        await mainBot.telegram.sendMessage(ADMIN_CONFIG.chatId, 
            `💰 <b>New Payment</b>\nUser: @${user} (<code>${userId}</code>)\nPlan: ${plan}\nAmount: ${amount}৳\nTrxID: <code>${trxId}</code>`,
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
        res.json({ success: true });
    } catch(e) { 
        res.json({ success: false, message: 'Admin Bot Error' }); 
    }
});

app.post('/api/broadcast', async (req, res) => {
    const { message, adminId } = req.body;
    if (adminId !== ADMIN_CONFIG.chatId) return res.json({ success: false, message: 'Forbidden' });

    const users = await UserModel.find({});
    let count = 0;
    
    users.forEach((u, i) => {
        setTimeout(async () => {
            try {
                await mainBot.telegram.sendMessage(u.userId, `📢 <b>Announcement</b>\n\n${message}`, { parse_mode: 'HTML' });
            } catch(e) {}
        }, i * 200);
        count++;
    });

    res.json({ success: true, total: count });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
