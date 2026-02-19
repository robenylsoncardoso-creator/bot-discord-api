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

async function sendLogEmbed(id, action, authorTag, color = 0x2ecc71) {

    const channel = await client.channels.fetch(LOG_CHANNEL_ID);
    if (!channel) return;

    try {
        const discordUser = await client.users.fetch(id);

        const embed = new EmbedBuilder()
            .setTitle(action)
            .setThumbnail(discordUser.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: "👤 Usuário", value: `<@${id}>`, inline: true },
                { name: "🆔 ID", value: id, inline: true },
                { name: "👮 Executado por", value: authorTag }
            )
            .setColor(color)
            .setTimestamp();

        channel.send({ embeds: [embed] });

    } catch {
        channel.send(`⚠️ ${action} | ID: ${id} | Por: ${authorTag}`);
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

        if (!hasPermission) return message.reply("❌ Sem permissão.");

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

        message.reply(`✅ Produto ${produto} adicionado para <@${id}>`);
        sendLogEmbed(id, `🟢 ADD (${produto})`, message.author.tag, 0x2ecc71);
        return;
    }

    // ================= RENOVAR =================

    if (command === '!renovar') {

        if (!hasPermission) return;

        const id = args[1];
        const produto = args[2]?.toLowerCase();
        const dias = parseInt(args[3]);

        let user = database.find(u => u.id === id);
        if (!user || !user.produtos[produto])
            return message.reply("Produto não encontrado.");

        const atual = user.produtos[produto].expires;

        let novaData = new Date();
        if (atual !== "life")
            novaData = new Date(atual);

        novaData.setDate(novaData.getDate() + dias);
        user.produtos[produto].expires = novaData.toISOString();

        saveDatabase(database);

        message.reply(`🔄 Renovado ${produto} de <@${id}>`);
        sendLogEmbed(id, `🔵 RENOVAR (${produto})`, message.author.tag, 0x3498db);
        return;
    }

    // ================= REMOVER =================

    if (command === '!remover') {

        if (!hasPermission) return;

        const id = args[1];
        const produto = args[2]?.toLowerCase();

        let user = database.find(u => u.id === id);
        if (!user || !user.produtos[produto])
            return message.reply("Produto não encontrado.");

        delete user.produtos[produto];

        saveDatabase(database);

        message.reply(`❌ Produto ${produto} removido de <@${id}>`);
        sendLogEmbed(id, `🔴 REMOVER (${produto})`, message.author.tag, 0xe74c3c);
        return;
    }

    // ================= INFO =================

    if (command === '!info') {

        if (!hasPermission) return;

        const id = args[1];
        let user = database.find(u => u.id === id);
        if (!user) return message.reply("ID não encontrado.");

        user = migrateUser(user);

        const discordUser = await client.users.fetch(id);

        const embed = new EmbedBuilder()
            .setTitle("🔎 Informações do Cliente")
            .setThumbnail(discordUser.displayAvatarURL({ dynamic: true }))
            .setColor(0x9b59b6)
            .addFields({ name: "👤 Usuário", value: `<@${id}>` });

        for (const produto in user.produtos) {

            const p = user.produtos[produto];

            let dias = "Vitalício";
            if (p.expires !== "life") {
                const now = new Date();
                const expireDate = new Date(p.expires);
                dias = Math.ceil((expireDate - now) / (1000 * 60 * 60 * 24)) + " dias";
            }

            embed.addFields({
                name: `📦 ${produto}`,
                value:
                    `📅 Tempo: ${dias}\n` +
                    `💻 HWID: ${p.hwid || "Não definido"}\n` +
                    `🕒 Último Login: ${p.lastLogin ? new Date(p.lastLogin).toLocaleString("pt-BR") : "Nunca"}`
            });
        }

        message.channel.send({ embeds: [embed] });
        return;
    }

});

// ================= API =================

app.get('/check/:id/:hwid/:produto', async (req, res) => {

    const { id, hwid, produto } = req.params;

    let database = loadDatabase();
    let blacklist = loadBlacklist();

    if (blacklist.includes(id))
        return res.send("pc_blocked");

    let user = database.find(u => u.id === id);
    if (!user) return res.send("false");

    user = migrateUser(user);

    const produtoData = user.produtos[produto];
    if (!produtoData) return res.send("false");

    if (!produtoData.hwid)
        produtoData.hwid = hwid;

    if (produtoData.hwid !== hwid)
        return res.send("pc_blocked");

    produtoData.lastLogin = new Date().toISOString();
    saveDatabase(database);

    if (produtoData.expires === "life")
        return res.send(`true|9999|${id}`);

    const now = new Date();
    const expireDate = new Date(produtoData.expires);

    if (expireDate < now)
        return res.send("expired");

    const dias = Math.ceil((expireDate - now) / (1000 * 60 * 60 * 24));

    return res.send(`true|${dias}|${id}`);
});

app.listen(PORT, () => {
    console.log(`API rodando na porta ${PORT}`);
});

client.once('clientReady', () => {
    console.log(`Bot online como ${client.user.tag}`);
});

client.login(process.env.TOKEN);