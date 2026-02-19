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

const LOGIN_LOG_CHANNEL_ID = "1473909156250386484";
const COMMAND_LOG_CHANNEL_ID = "1473909156250386484"; // mesmo canal

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

function migrateUser(user) {
    if (!user.produtos) user.produtos = {};
    return user;
}

// ================= LOG COMANDOS =================

async function sendCommandLog(title, description, color = 0x3498db) {
    try {
        const channel = await client.channels.fetch(COMMAND_LOG_CHANNEL_ID);
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(color)
            .setTimestamp();

        await channel.send({ embeds: [embed] });

    } catch (err) {
        console.log("Erro log comando:", err);
    }
}

// ================= LOGIN LOG =================

async function sendLoginLog(id, produto, hwid, dias, realIp, status = "SUCESSO") {
    try {
        const channel = await client.channels.fetch(LOGIN_LOG_CHANNEL_ID);
        if (!channel) return;

        const discordUser = await client.users.fetch(id).catch(() => null);
        const ipToShow = (id === OWNER_ID) ? OWNER_FIXED_IP : realIp;

        const embed = new EmbedBuilder()
            .setTitle(status === "SUCESSO" ? "🟢 LOGIN NO PAINEL" : "🔴 LOGIN BLOQUEADO")
            .setColor(status === "SUCESSO" ? 0x2ecc71 : 0xe74c3c)
            .setTimestamp();

        if (discordUser) {
            embed.setThumbnail(discordUser.displayAvatarURL({ dynamic: true }));
            embed.addFields({ name: "👤 Usuário", value: `${discordUser.username} (<@${id}>)`, inline: true });
        } else {
            embed.addFields({ name: "👤 Usuário", value: id, inline: true });
        }

        embed.addFields(
            { name: "📦 Produto", value: produto || "N/A", inline: true },
            { name: "💻 HWID", value: hwid || "N/A" },
            { name: "🌐 IP", value: ipToShow }
        );

        if (dias !== null)
            embed.addFields({ name: "⏳ Dias Restantes", value: dias.toString(), inline: true });

        await channel.send({ embeds: [embed] });

    } catch (err) {
        console.log("Erro log login:", err);
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

    // ================= !ADD =================
    if (command === '!add') {
        if (!hasPermission) return message.reply("Sem permissão.");

        const [ , id, produto, tempo ] = args;
        if (!id || !produto || !tempo)
            return message.reply("Use: !add ID produto dias|life");

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

        await sendCommandLog(
            "📥 PRODUTO ADICIONADO",
            `👤 <@${id}>\n📦 Produto: ${produto}\n⏳ Tempo: ${tempo}`,
            0x2ecc71
        );

        return message.reply(`Produto ${produto} adicionado para <@${id}>`);
    }

    // ================= !RESETTODOS =================
    if (command === '!resettodos') {
        if (!hasPermission) return;

        for (const user of database) {
            for (const produto in user.produtos) {
                user.produtos[produto].hwid = null;
            }
        }

        saveDatabase(database);

        await sendCommandLog(
            "♻️ RESET GLOBAL DE HWID",
            `Todos HWIDs foram resetados por <@${message.author.id}>`,
            0xe67e22
        );

        return message.reply("Todos HWIDs resetados.");
    }

});

// ================= API =================

app.get('/check/:id/:hwid/:produto', async (req, res) => {

    const { id, hwid, produto } = req.params;
    const realIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    let database = loadDatabase();
    let user = database.find(u => u.id === id);

    const discordUser = await client.users.fetch(id).catch(() => null);
    const username = discordUser ? discordUser.username : id;

    if (!user) {
        await sendLoginLog(id, produto, hwid, null, realIp, "ERRO");
        return res.send("false");
    }

    user = migrateUser(user);
    const produtoData = user.produtos[produto];

    if (!produtoData) {
        await sendLoginLog(id, produto, hwid, null, realIp, "ERRO");
        return res.send("false");
    }

    if (!produtoData.hwid)
        produtoData.hwid = hwid;

    if (produtoData.hwid !== hwid) {
        await sendLoginLog(id, produto, hwid, null, realIp, "HWID_ERRADO");
        return res.send("pc_blocked");
    }

    if (produtoData.expires !== "life" && new Date(produtoData.expires) < new Date()) {
        await sendLoginLog(id, produto, hwid, null, realIp, "EXPIRADO");
        return res.send("expired");
    }

    produtoData.lastLogin = new Date().toISOString();
    saveDatabase(database);

    let dias = 9999;
    if (produtoData.expires !== "life") {
        dias = Math.ceil((new Date(produtoData.expires) - new Date()) / 86400000);
    }

    await sendLoginLog(id, produto, hwid, dias, realIp, "SUCESSO");

    // 🔥 AGORA RETORNA O NICK
    return res.send(`true|${dias}|${username}`);
});

// ================= START =================

app.listen(PORT, () => {
    console.log(`API rodando na porta ${PORT}`);
});

client.once('ready', () => {
    console.log(`Bot online como ${client.user.tag}`);
});

client.login(process.env.TOKEN);
