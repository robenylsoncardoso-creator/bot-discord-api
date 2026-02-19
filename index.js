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

// 🔐 Canal apenas para LOGIN
const LOGIN_LOG_CHANNEL_ID = "1473909156250386484";

// 📦 Canal apenas para comandos administrativos
const COMMAND_LOG_CHANNEL_ID = "COLOQUE_AQUI_ID_DO_CANAL_DE_COMANDOS";

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

// ================= LOG LOGIN =================

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

    if (!hasPermission) return;

    // ================= !ADD =================
    if (command === '!add') {

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

    // ================= !RENOVAR =================
    if (command === '!renovar') {
        const [ , id, produto, diasAdd ] = args;
        const dias = parseInt(diasAdd);

        let user = database.find(u => u.id === id);
        if (!user || !user.produtos[produto])
            return message.reply("Não encontrado.");

        const data = new Date(user.produtos[produto].expires === "life" ? new Date() : user.produtos[produto].expires);
        data.setDate(data.getDate() + dias);
        user.produtos[produto].expires = data.toISOString();

        saveDatabase(database);

        await sendCommandLog(
            "🔄 PRODUTO RENOVADO",
            `👤 <@${id}>\n📦 ${produto}\n⏳ +${dias} dias`,
            0x3498db
        );

        return message.reply("Renovado com sucesso.");
    }

    // ================= !REMOVER =================
    if (command === '!remover') {
        const [ , id, produto ] = args;

        let user = database.find(u => u.id === id);
        if (!user || !user.produtos[produto])
            return message.reply("Não encontrado.");

        delete user.produtos[produto];
        saveDatabase(database);

        await sendCommandLog(
            "❌ PRODUTO REMOVIDO",
            `👤 <@${id}>\n📦 ${produto}`,
            0xe74c3c
        );

        return message.reply("Produto removido.");
    }

    // ================= !RESETARHWID =================
    if (command === '!resetarhwid') {
        const [ , id, produto ] = args;

        let user = database.find(u => u.id === id);
        if (!user || !user.produtos[produto])
            return message.reply("Não encontrado.");

        user.produtos[produto].hwid = null;
        saveDatabase(database);

        await sendCommandLog(
            "♻️ HWID RESETADO",
            `👤 <@${id}>\n📦 ${produto}`,
            0xf1c40f
        );

        return message.reply("HWID resetado.");
    }

    // ================= !RESETTODOS =================
    if (command === '!resettodos') {

        for (const user of database) {
            for (const produto in user.produtos) {
                user.produtos[produto].hwid = null;
            }
        }

        saveDatabase(database);

        await sendCommandLog(
            "♻️ RESET GLOBAL",
            `Executado por <@${message.author.id}>`,
            0xe67e22
        );

        return message.reply("Todos HWIDs resetados.");
    }

    // ================= !INFO =================
    if (command === '!info') {

        const id = args[1];
        let user = database.find(u => u.id === id);
        if (!user) return message.reply("ID não encontrado.");

        user = migrateUser(user);

        const discordUser = await client.users.fetch(id);

        const embed = new EmbedBuilder()
            .setTitle("🔎 Informações do Cliente")
            .setThumbnail(discordUser.displayAvatarURL({ dynamic: true }))
            .setColor(0x3498db);

        for (const produto in user.produtos) {
            const p = user.produtos[produto];

            let dias = "Vitalício";
            if (p.expires !== "life") {
                const restante = Math.ceil((new Date(p.expires) - new Date()) / 86400000);
                dias = restante > 0 ? restante + " dias" : "Expirado";
            }

            embed.addFields({
                name: `📦 ${produto}`,
                value:
                    `⏳ ${dias}\n` +
                    `💻 HWID: ${p.hwid || "Não definido"}\n` +
                    `🕒 Último login: ${p.lastLogin ? new Date(p.lastLogin).toLocaleString("pt-BR") : "Nunca"}`
            });
        }

        return message.channel.send({ embeds: [embed] });
    }

});
