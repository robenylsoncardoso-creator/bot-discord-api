const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ================= CONFIG =================

const ROLE_1 = "1470795209993490514";
const ROLE_2 = "1470795209234448561";
const ALLOWED_CHANNEL_ID = "1473023470861291600";

// ================= BANCO =================

function loadDatabase() {
    if (!fs.existsSync("ids.json")) return [];
    return JSON.parse(fs.readFileSync("ids.json", "utf8"));
}

function saveDatabase(data) {
    fs.writeFileSync("ids.json", JSON.stringify(data, null, 2));
}

function loadBlacklist() {
    if (!fs.existsSync("blacklist.json")) return [];
    return JSON.parse(fs.readFileSync("blacklist.json", "utf8"));
}

function saveBlacklist(data) {
    fs.writeFileSync("blacklist.json", JSON.stringify(data, null, 2));
}

// ================= COMANDOS =================

client.on('messageCreate', async (message) => {

    if (message.author.bot) return;
    if (!message.content.startsWith('!')) return;
    if (message.channel.id !== ALLOWED_CHANNEL_ID) return;

    const hasPermission =
        message.member.roles.cache.has(ROLE_1) ||
        message.member.roles.cache.has(ROLE_2);

    const args = message.content.split(' ');
    const command = args[0].toLowerCase();

    let database = loadDatabase();
    let blacklist = loadBlacklist();

    // ================= ADD =================

    if (command === '!add') {

        if (!hasPermission)
            return message.reply("❌ Sem permissão.");

        const id = args[1];
        const tempo = args[2];

        if (!id || !tempo)
            return message.reply("Use: !add ID DIAS ou !add ID life");

        let expires;

        if (tempo.toLowerCase() === "life") {
            expires = "life";
        } else {
            const dias = parseInt(tempo);
            if (isNaN(dias)) return message.reply("Tempo inválido.");

            const data = new Date();
            data.setDate(data.getDate() + dias);
            expires = data.toISOString();
        }

        database = database.filter(u => u.id !== id);

        database.push({
            id,
            expires,
            hwid: null
        });

        saveDatabase(database);

        message.reply(`✅ ID ${id} adicionado.`);
        return;
    }

    // ================= LISTAR =================

    if (command === '!listar') {

        if (!hasPermission)
            return message.reply("❌ Sem permissão.");

        if (database.length === 0)
            return message.reply("📭 Nenhum ID ativo.");

        let lista = database.map(user => {
            const plano = user.expires === "life"
                ? "Vitalício"
                : new Date(user.expires).toLocaleDateString();

            return `🆔 ${user.id} | 📅 ${plano} | 💻 ${user.hwid || "Sem HWID"}`;
        }).join("\n");

        message.reply(`📋 IDS ATIVOS:\n\n${lista}`);
        return;
    }

    // ================= DESAUTORIZAR =================

    if (command === '!desautorizar') {

        if (!hasPermission)
            return message.reply("❌ Sem permissão.");

        const id = args[1];
        if (!id) return message.reply("Use: !desautorizar ID");

        database = database.filter(u => u.id !== id);

        if (!blacklist.includes(id)) {
            blacklist.push(id);
        }

        saveDatabase(database);
        saveBlacklist(blacklist);

        message.reply(`🚫 ID ${id} desautorizado e colocado na blacklist.`);
        return;
    }

    // ================= BLACKLIST =================

    if (command === '!blacklist') {

        if (!hasPermission)
            return message.reply("❌ Sem permissão.");

        if (blacklist.length === 0)
            return message.reply("📭 Nenhum ID na blacklist.");

        let lista = blacklist.map(id => `🚫 ${id}`).join("\n");

        message.reply(`⛔ BLACKLIST:\n\n${lista}`);
        return;
    }

});

// ================= API CHECK =================

app.get('/check/:id/:hwid', (req, res) => {

    try {

        const { id, hwid } = req.params;

        let database = loadDatabase();
        let blacklist = loadBlacklist();

        if (blacklist.includes(id)) {
            return res.send("pc_blocked");
        }

        const user = database.find(u => u.id === id);
        if (!user) {
            return res.send("false");
        }

        // ================= VITALICIO =================

        if (user.expires === "life") {

            if (!user.hwid) {
                user.hwid = hwid;
                saveDatabase(database);
            }

            if (user.hwid !== hwid) {
                return res.send("pc_blocked");
            }

            return res.send("true");
        }

        // ================= DATA NORMAL =================

        const now = new Date();
        const expireDate = new Date(user.expires);

        if (expireDate < now) {
            return res.send("expired");
        }

        if (!user.hwid) {
            user.hwid = hwid;
            saveDatabase(database);
        }

        if (user.hwid !== hwid) {
            return res.send("pc_blocked");
        }

        const diasRestantes = Math.ceil(
            (expireDate - now) / (1000 * 60 * 60 * 24)
        );

        return res.send(`true|${diasRestantes}`);

    } catch (err) {
        console.log("Erro na API:", err);
        return res.send("false");
    }

});

// ================= ROOT =================

app.get('/', (req, res) => {
    res.send("Bot Online");
});

app.listen(PORT, () => {
    console.log(`API rodando na porta ${PORT}`);
});

client.once('ready', () => {
    console.log(`Bot online como ${client.user.tag}`);
});

client.login(process.env.TOKEN);