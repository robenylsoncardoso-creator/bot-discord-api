const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
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
const LOG_CHANNEL_ID = "1473313752794267698";

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

// ================= MIGRAÇÃO AUTOMÁTICA =================

function migrateUser(user) {
    if (!user.produtos) {
        user.produtos = {
            freefire: {
                expires: user.expires,
                hwid: user.hwid || null,
                lastLogin: null
            }
        };
        delete user.expires;
        delete user.hwid;
    }
    return user;
}

// ================= LOG =================

async function sendLogEmbed(id, action, authorTag) {
    try {
        const channel = await client.channels.fetch(LOG_CHANNEL_ID);
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setTitle(action)
            .addFields(
                { name: "🆔 ID", value: id },
                { name: "👮 Executado por", value: authorTag }
            )
            .setColor(0xff9900)
            .setTimestamp();

        channel.send({ embeds: [embed] });

    } catch (err) {
        console.log("Erro log:", err);
    }
}

// ================= COMANDOS =================

client.on('messageCreate', async (message) => {

    if (message.author.bot) return;
    if (!message.content.startsWith('!')) return;
    if (message.channel.id !== ALLOWED_CHANNEL_ID) return;

    const hasPermission =
        message.member.roles.cache.has(ROLE_1) ||
        message.member.roles.cache.has(ROLE_2);

    const args = message.content.trim().split(/\s+/);
    const command = args[0].toLowerCase();

    let database = loadDatabase();
    let blacklist = loadBlacklist();

    // ================= ADD =================

    if (command === '!add') {

        if (!hasPermission)
            return message.reply("❌ Sem permissão.");

        const id = args[1];
        const produto = args[2]?.toLowerCase();
        const tempo = args[3];

        if (!id || !produto || !tempo)
            return message.reply("Use: !add ID PRODUTO DIAS ou life");

        let expires;

        if (tempo.toLowerCase() === "life") {
            expires = "life";
        } else {
            const dias = parseInt(tempo);
            if (isNaN(dias) || dias <= 0)
                return message.reply("Dias inválidos.");

            const data = new Date();
            data.setDate(data.getDate() + dias);
            expires = data.toISOString();
        }

        let user = database.find(u => u.id === id);

        if (!user) {
            user = { id, produtos: {} };
            database.push(user);
        }

        user = migrateUser(user);

        user.produtos[produto] = {
            expires,
            hwid: null,
            lastLogin: null
        };

        saveDatabase(database);

        message.reply(`✅ ${id} adicionado ao produto ${produto}.`);
        sendLogEmbed(id, `🟢 ADD (${produto})`, message.author.tag);
        return;
    }

});

// ================= API CHECK =================

app.get('/check/:id/:hwid/:produto', async (req, res) => {

    try {

        const { id, hwid } = req.params;
        const produto = (req.params.produto || "freefire").toLowerCase();

        let database = loadDatabase();
        let blacklist = loadBlacklist();

        if (blacklist.includes(id))
            return res.send("pc_blocked");

        let user = database.find(u => u.id === id);
        if (!user)
            return res.send("false");

        user = migrateUser(user);

        const produtoData = user.produtos[produto];
        if (!produtoData)
            return res.send("false");

        // Buscar nickname do Discord
        let username = id;
        try {
            const discordUser = await client.users.fetch(id);
            username = discordUser.username;
        } catch {}

        if (produtoData.expires === "life") {

            if (!produtoData.hwid) {
                produtoData.hwid = hwid;
            }

            if (produtoData.hwid !== hwid)
                return res.send("pc_blocked");

            produtoData.lastLogin = new Date().toISOString();
            saveDatabase(database);

            return res.send(`true|9999|${username}`);
        }

        const now = new Date();
        const expireDate = new Date(produtoData.expires);

        if (expireDate < now)
            return res.send("expired");

        if (!produtoData.hwid) {
            produtoData.hwid = hwid;
        }

        if (produtoData.hwid !== hwid)
            return res.send("pc_blocked");

        let diasRestantes = Math.ceil(
            (expireDate - now) / (1000 * 60 * 60 * 24)
        );

        if (diasRestantes < 1) diasRestantes = 1;

        produtoData.lastLogin = new Date().toISOString();
        saveDatabase(database);

        return res.send(`true|${diasRestantes}|${username}`);

    } catch (err) {
        console.log("Erro API:", err);
        return res.send("false");
    }
});

app.get('/', (req, res) => {
    res.send("Bot Online");
});

app.listen(PORT, () => {
    console.log(`API rodando na porta ${PORT}`);
});

client.once('clientReady', () => {
    console.log(`Bot online como ${client.user.tag}`);
});

client.login(process.env.TOKEN);