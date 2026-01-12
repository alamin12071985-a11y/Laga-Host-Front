require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

// --- CONFIGURATION (User Provided) ---
const ADMIN_CONFIG = {
    token: "8353228427:AAHcfw6T-ZArT4J8HUW1TbSa9Utor2RxlLY",
    chatId: "7605281774"
};

// URL Encoded Password: l@g@ho$t -> l%40g%40ho%24t
// If your password includes the <> brackets, please let me know. 
// Assuming password is: l@g@ho$t
const MONGO_URI = "mongodb+srv://lagahost:l%40g%40ho%24t@snowmanadventure.ocodku0.mongodb.net/snowmanadventure?retryWrites=true&w=majority&appName=snowmanadventure";

// --- 1. Database Connection ---
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected Successfully'))
    .catch(err => {
        console.error('❌ MongoDB Connection Error:', err.message);
        console.log('Hint: Ensure your IP is whitelisted in MongoDB Atlas Network Access (0.0.0.0/0)');
    });

// --- 2. Schemas ---
const botSchema = new mongoose.Schema({
    ownerId: { type: String, required: true },
    name: String,
    token: String,
    status: { type: String, default: 'STOPPED' },
    commands: { type: Object, default: {} },
    createdAt: { type: Date, default: Date.now }
});

const BotModel = mongoose.model('Bot', botSchema);

let activeBotInstances = {};

// --- 3. Middleware ---
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- 4. Bot Engine Logic ---
async function startBotEngine(botDoc) {
    try {
        if (activeBotInstances[botDoc._id]) return true;

        const bot = new Telegraf(botDoc.token);

        // Error Handling
        bot.catch((err, ctx) => {
            console.log(`Bot ${botDoc.name} error:`, err);
        });

        // Dynamic Commands
        bot.on('message', async (ctx) => {
            if (!ctx.message.text) return;
            const text = ctx.message.text;

            if (text.startsWith('/')) {
                const cmdName = text.substring(1).split(' ')[0];
                const currentBot = await BotModel.findById(botDoc._id);
                const code = currentBot?.commands[cmdName];

                if (code) {
                    try {
                        const func = new Function('ctx', code);
                        func(ctx);
                    } catch (e) {
                        ctx.reply(`⚠️ execution error: ${e.message}`);
                    }
                }
            }
        });

        await bot.launch();
        activeBotInstances[botDoc._id] = bot;
        console.log(`🚀 Started: ${botDoc.name}`);
        return true;
    } catch (e) {
        console.error(`❌ Start failed for ${botDoc.name}:`, e.message);
        if(e.code === 401 || e.message.includes('Unauthorized')) {
            await BotModel.findByIdAndUpdate(botDoc._id, { status: 'STOPPED' });
        }
        return false;
    }
}

// Restore bots on restart
async function restoreBots() {
    const runningBots = await BotModel.find({ status: 'RUNNING' });
    console.log(`🔄 Restoring ${runningBots.length} bots...`);
    for (const bot of runningBots) {
        await startBotEngine(bot);
    }
}
// Wait for DB connection then restore
mongoose.connection.once('open', restoreBots);

// --- 5. API Routes ---

app.get('/api/bots', async (req, res) => {
    const { userId } = req.query;
    if(!userId) return res.json([]);
    const bots = await BotModel.find({ ownerId: userId }).sort({ createdAt: -1 });
    res.json(bots);
});

app.post('/api/createBot', async (req, res) => {
    const { token, name, userId } = req.body;
    
    // Basic Token Validation
    if (!token.includes(':')) {
        return res.json({ success: false, message: 'Invalid Bot Token' });
    }

    try {
        // Check duplicate
        const exist = await BotModel.findOne({ token });
        if(exist) return res.json({ success: false, message: 'Token already used' });

        const newBot = await BotModel.create({
            ownerId: userId,
            name,
            token,
            status: 'STOPPED'
        });
        res.json({ success: true, bot: newBot });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

app.post('/api/toggleBot', async (req, res) => {
    const { botId, action } = req.body;
    const botDoc = await BotModel.findById(botId);
    if (!botDoc) return res.status(404).json({ error: 'Bot not found' });

    if (action === 'start') {
        const started = await startBotEngine(botDoc);
        if (started) {
            botDoc.status = 'RUNNING';
            await botDoc.save();
            res.json({ success: true });
        } else {
            res.json({ success: false, message: 'Invalid Token or Network Error' });
        }
    } else {
        if (activeBotInstances[botId]) {
            activeBotInstances[botId].stop('Web Stop');
            delete activeBotInstances[botId];
        }
        botDoc.status = 'STOPPED';
        await botDoc.save();
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

app.post('/api/submit-payment', async (req, res) => {
    const { trxId, plan, amount, user } = req.body;
    
    // Send to Admin
    try {
        const adminBot = new Telegraf(ADMIN_CONFIG.token);
        await adminBot.telegram.sendMessage(ADMIN_CONFIG.chatId, 
            `🔔 <b>New Payment Request</b>\n\n` +
            `👤 <b>User:</b> @${user}\n` +
            `💎 <b>Plan:</b> ${plan}\n` +
            `💰 <b>Amount:</b> ${amount} BDT\n` +
            `🧾 <b>TrxID:</b> <code>${trxId}</code>\n\n` +
            `<i>Check Nagad App and Approve manually.</i>`, 
            { parse_mode: 'HTML' }
        );
        res.json({ success: true });
    } catch (e) {
        console.error('Admin notify failed:', e);
        res.json({ success: true, message: 'Saved but admin notify failed' });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
