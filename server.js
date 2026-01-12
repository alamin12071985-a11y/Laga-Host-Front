const express = require('express');
const { Telegraf } = require('telegraf');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory storage (Use Database for production)
let bots = [];
let commands = {}; 
let activeBotInstances = {};

// --- API Endpoints ---

// 1. Get All Bots
app.get('/getBots', (req, res) => {
    res.json(bots);
});

// 2. Create Bot
app.post('/createBot', async (req, res) => {
    const { token, name } = req.body;
    if (!token || !name) return res.status(400).json({ error: 'Missing fields' });

    const newBot = {
        botId: Date.now().toString(),
        name,
        token,
        status: 'STOPPED',
        createdAt: new Date()
    };
    bots.push(newBot);
    commands[newBot.botId] = {}; // Init commands
    res.json({ success: true, bot: newBot });
});

// 3. Start Bot
app.post('/startBot', (req, res) => {
    const { botId } = req.body;
    const botData = bots.find(b => b.botId === botId);
    
    if (!botData) return res.status(404).json({ error: 'Bot not found' });
    if (activeBotInstances[botId]) return res.json({ success: true, message: 'Already running' });

    try {
        const bot = new Telegraf(botData.token);
        
        // Load commands
        const botCmds = commands[botId] || {};
        
        // Register generic command handler
        bot.on('message', async (ctx) => {
            if (!ctx.message.text) return;
            const text = ctx.message.text;
            
            // Check for defined commands
            if (text.startsWith('/')) {
                const cmdName = text.substring(1).split(' ')[0];
                if (botCmds[cmdName]) {
                    try {
                        // Safe eval context
                        const func = new Function('ctx', botCmds[cmdName]);
                        func(ctx);
                    } catch (e) {
                        ctx.reply(`Error executing command: ${e.message}`);
                    }
                }
            }
        });

        bot.launch();
        activeBotInstances[botId] = bot;
        botData.status = 'RUNNING';
        
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to start bot' });
    }
});

// 4. Stop Bot
app.post('/stopBot', (req, res) => {
    const { botId } = req.body;
    const botInstance = activeBotInstances[botId];
    
    if (botInstance) {
        botInstance.stop('Web Stop');
        delete activeBotInstances[botId];
    }
    
    const botData = bots.find(b => b.botId === botId);
    if (botData) botData.status = 'STOPPED';
    
    res.json({ success: true });
});

// 5. Delete Bot
app.post('/deleteBot', (req, res) => {
    const { botId } = req.body;
    
    // Stop if running
    if (activeBotInstances[botId]) {
        activeBotInstances[botId].stop();
        delete activeBotInstances[botId];
    }
    
    bots = bots.filter(b => b.botId !== botId);
    delete commands[botId];
    res.json({ success: true });
});

// --- Command Management ---
app.get('/getCommands', (req, res) => {
    const { botId } = req.query;
    res.json(commands[botId] || {});
});

app.post('/addCommand', (req, res) => {
    const { botId, name, code } = req.body;
    if (!commands[botId]) commands[botId] = {};
    commands[botId][name] = code;
    
    // Restart logic would be needed here for complex bots, 
    // but our dynamic handler above handles live updates.
    res.json({ success: true });
});

// --- Payment & Admin Notification ---
app.post('/submit-payment', async (req, res) => {
    const { trxId, plan, amount, user } = req.body;
    
    // In a real app, send this to your Admin Bot
    console.log(`New Payment Request:
    Plan: ${plan}
    Amount: ${amount}
    TrxID: ${trxId}
    `);

    // Simulate success
    res.json({ success: true, message: 'Request sent to admin' });
});

// Serve UI
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Laga Host Server running on port ${PORT}`);
});
