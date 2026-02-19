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

// 📦 Canal de comandos (!add e !resettodos)
const LOG_CHANNEL_ID = "1473313752794267698";

// 🔐 Canal exclusivo de LOGIN
const LOGIN_LOG_CHANNEL_ID = "1473925443211100297";

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

// ================= LOG ADMIN =================

async function sendAdminLog(id, action, authorTag) {
    try {
        const channel = await client.channels.fetch(LOG_CHANNEL_ID);
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setTitle(action)
            .addFields(
                { name: "👤 Usuário", value: `<@${id}>`, inline: true },
                { name: "🆔 ID", value: id, inline: true },
                { name: "👮 Executado por", value: authorTag }
            )
            .setColor(0xff9900)
            .setTimestamp();

        channel.send({ embeds: [embed] });

    } catch (err) {
        console.log("Erro log admin:", err);
    }
}

// ================= LOG LOGIN =================

async function sendLoginLog(id, hwid, status) {
    try {
        const channel = await client.channels.fetch(LOGIN_LOG_CHANNEL_ID);
        if (!channel) return;

        let username = id;
        try {
            const discordUser = await client.users.fetch(id);
            username = discordUser.username;
        } catch {}

        const embed = new EmbedBuilder()
            .setTitle("🔐 LOGIN DETECTADO")
            .addFields(
                { name: "👤 Usuário", value: username, inline: true },
                { name: "🆔 ID", value: id, inline: true },
                { name: "💻 HWID", value: hwid },
                { name: "📌 Status", value: status }
            )
            .setColor(
                status === "SUCESSO" ? 0x2ecc71 :
                status === "HWID_ERRADO" ? 0xe74c3c :
                status === "EXPIRADO" ? 0xf1c40f :
                0xe67e22
            )
            .setTimestamp();

        channel.send({ embeds: [embed] });

    } catch (err) {
        console.log("Erro log login:", err);
    }
}

// ================= COMANDOS =================

client.on('messageCreate', async (message) => {

    try {

        if (message.author.bot) return;
        if (!message.content.startsWith('!')) return;
        if (message.channel.id !== ALLOWED_CHANNEL_ID) return;

        const hasPermission =
            message.member.roles.cache.has(ROLE_1) ||
            message.member.roles.cache.has(ROLE_2);

        const args = message.content.trim().split(/\s+/);
        const command = args[0].toLowerCase();

        let database = loadDatabase();

        if (!hasPermission)
            return message.reply("❌ Sem permissão.");

        // ================= !ADD =================

        if (command === '!add') {

            const id = args[1];
            const tempo = args[2];

            if (!id || !tempo)
                return message.reply("Use: !add ID DIAS ou life");

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
            sendAdminLog(id, "🟢 ADD", message.author.tag);
            return;
        }

        // ================= !RESETTODOS =================

        if (command === '!resettodos') {

            database.forEach(u => u.hwid = null);
            saveDatabase(database);

            message.reply("🔄 Todos HWIDs resetados.");
            sendAdminLog("TODOS", "🔄 RESET TODOS", message.author.tag);
            return;
        }

    } catch (err) {
        console.log("Erro em messageCreate:", err);
    }
});

// ================= API CHECK =================

app.get('/check/:id/:hwid', async (req, res) => {

    try {

        const { id, hwid } = req.params;

        let database = loadDatabase();
        let blacklist = loadBlacklist();

        if (blacklist.includes(id)) {
            await sendLoginLog(id, hwid, "BLACKLIST");
            return res.send("pc_blocked");
        }

        const user = database.find(u => u.id === id);
        if (!user) {
            await sendLoginLog(id, hwid, "NAO_ENCONTRADO");
            return res.send("false");
        }

        let username = id;
        try {
            const discordUser = await client.users.fetch(id);
            username = discordUser.username;
        } catch {}

        if (user.expires === "life") {

            if (!user.hwid) {
                user.hwid = hwid;
                saveDatabase(database);
            }

            if (user.hwid !== hwid) {
                await sendLoginLog(id, hwid, "HWID_ERRADO");
                return res.send("pc_blocked");
            }

            await sendLoginLog(id, hwid, "SUCESSO");
            return res.send(`true|9999|${username}`);
        }

        const now = new Date();
        const expireDate = new Date(user.expires);

        if (expireDate < now) {
            await sendLoginLog(id, hwid, "EXPIRADO");
            return res.send("expired");
        }

        if (!user.hwid) {
            user.hwid = hwid;
            saveDatabase(database);
        }

        if (user.hwid !== hwid) {
            await sendLoginLog(id, hwid, "HWID_ERRADO");
            return res.send("pc_blocked");
        }

        let diasRestantes = Math.ceil(
            (expireDate - now) / (1000 * 60 * 60 * 24)
        );

        if (diasRestantes < 1) diasRestantes = 1;

        await sendLoginLog(id, hwid, "SUCESSO");
        return res.send(`true|${diasRestantes}|${username}`);

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
