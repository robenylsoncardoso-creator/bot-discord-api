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

// 🔥 CANAL FIXO PARA LOG DE LOGIN
const LOGIN_LOG_CHANNEL_ID = "1473909156250386484";

// 🔥 SEU ID E IP FIXO
const OWNER_ID = "1464438974411051252";
const OWNER_FIXED_IP = "***.***.***.**";

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

// ================= LOG LOGIN =================

async function sendLoginLog(id, produto, hwid, dias, realIp) {
    try {
        const channel = await client.channels.fetch(LOGIN_LOG_CHANNEL_ID);
        if (!channel) return;

        const discordUser = await client.users.fetch(id);

        // 🔥 AQUI ESTÁ A LÓGICA DO IP FIXO
        const ipToShow = (id === OWNER_ID) ? OWNER_FIXED_IP : realIp;

        const embed = new EmbedBuilder()
            .setTitle("🟢 LOGIN NO PAINEL")
            .setThumbnail(discordUser.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: "👤 Usuário", value: `<@${id}>`, inline: true },
                { name: "📦 Produto", value: produto, inline: true },
                { name: "⏳ Dias Restantes", value: dias.toString(), inline: true },
                { name: "💻 HWID", value: hwid },
                { name: "🌐 IP", value: ipToShow }
            )
            .setColor(0x2ecc71)
            .setTimestamp();

        await channel.send({ embeds: [embed] });

    } catch (err) {
        console.log("Erro ao enviar log de login:", err);
    }
}

// ================= API =================

app.get('/check/:id/:hwid/:produto', async (req, res) => {

    const { id, hwid, produto } = req.params;
    const realIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    let database = loadDatabase();
    let blacklist = loadBlacklist();

    if (blacklist.includes(id))
        return res.send("pc_blocked");

    let user = database.find(u => u.id === id);
    if (!user) return res.send("false");

    user = migrateUser(user);

    const produtoData = user.produtos[produto];
    if (!produtoData) return res.send("false");

    let username = id;

    try {
        const discordUser = await client.users.fetch(id);
        username = discordUser.username;
    } catch {}

    if (!produtoData.hwid)
        produtoData.hwid = hwid;

    if (produtoData.hwid !== hwid)
        return res.send("pc_blocked");

    produtoData.lastLogin = new Date().toISOString();
    saveDatabase(database);

    if (produtoData.expires === "life") {
        await sendLoginLog(id, produto, hwid, 9999, realIp);
        return res.send(`true|9999|${username}`);
    }

    const now = new Date();
    const expireDate = new Date(produtoData.expires);

    if (expireDate < now)
        return res.send("expired");

    const dias = Math.ceil((expireDate - now) / 86400000);

    await sendLoginLog(id, produto, hwid, dias, realIp);

    return res.send(`true|${dias}|${username}`);
});

app.listen(PORT, () => {
    console.log(`API rodando na porta ${PORT}`);
});

client.once('clientReady', () => {
    console.log(`Bot online como ${client.user.tag}`);
});

client.login(process.env.TOKEN);