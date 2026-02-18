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

// ================= LOG EMBED =================

async function sendLogEmbed(id, action, authorTag) {
    try {
        const channel = await client.channels.fetch(LOG_CHANNEL_ID);
        if (!channel) return;

        let discordUser;
        try {
            discordUser = await client.users.fetch(id);
        } catch {
            return channel.send(`⚠️ ${action} | ID: ${id} | Por: ${authorTag}`);
        }

        const embed = new EmbedBuilder()
            .setTitle(action)
            .setThumbnail(discordUser.displayAvatarURL({ dynamic: true, size: 512 }))
            .addFields(
                { name: "👤 Usuário", value: `<@${id}>`, inline: true },
                { name: "🆔 ID", value: id, inline: true },
                { name: "👮 Executado por", value: authorTag }
            )
            .setColor(0xff9900)
            .setTimestamp();

        channel.send({ embeds: [embed] });

    } catch (err) {
        console.log("Erro ao enviar log:", err);
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
            sendLogEmbed(id, "🟢 ADD", message.author.tag);
            return;
        }

        // ================= LISTAR =================

        if (command === '!listar') {

            if (!hasPermission)
                return message.reply("❌ Sem permissão.");

            if (database.length === 0)
                return message.reply("📭 Nenhum ID ativo.");

            for (const user of database) {

                let dias = "Vitalício";

                if (user.expires !== "life") {
                    const now = new Date();
                    const expireDate = new Date(user.expires);
                    let diasRestantes = Math.ceil((expireDate - now) / (1000 * 60 * 60 * 24));
                    if (diasRestantes < 1) diasRestantes = 1;
                    dias = `${diasRestantes} dias`;
                }

                let discordUser;
                try {
                    discordUser = await client.users.fetch(user.id);
                } catch {
                    continue;
                }

                const embed = new EmbedBuilder()
                    .setTitle("📋 ID Ativo")
                    .setThumbnail(discordUser.displayAvatarURL({ dynamic: true, size: 512 }))
                    .addFields(
                        { name: "👤 Usuário", value: `<@${user.id}>`, inline: true },
                        { name: "🆔 ID", value: user.id, inline: true },
                        { name: "📅 Tempo", value: dias, inline: true },
                        { name: "💻 HWID", value: user.hwid || "Não definido" }
                    )
                    .setColor(0x2ecc71)
                    .setTimestamp();

                await message.channel.send({ embeds: [embed] });
            }

            return;
        }

        // ================= INFO =================

        if (command === '!info') {

            if (!hasPermission)
                return message.reply("❌ Sem permissão.");

            const id = args[1];
            if (!id) return message.reply("Use: !info ID");

            const user = database.find(u => u.id === id);
            if (!user) return message.reply("ID não encontrado.");

            let dias = "Vitalício";

            if (user.expires !== "life") {
                const now = new Date();
                const expireDate = new Date(user.expires);
                let diasRestantes = Math.ceil((expireDate - now) / (1000 * 60 * 60 * 24));
                if (diasRestantes < 1) diasRestantes = 1;
                dias = `${diasRestantes} dias`;
            }

            let discordUser;
            try {
                discordUser = await client.users.fetch(id);
            } catch {
                return message.reply("Usuário não encontrado.");
            }

            const embed = new EmbedBuilder()
                .setTitle("🔎 Informações do ID")
                .setThumbnail(discordUser.displayAvatarURL({ dynamic: true, size: 512 }))
                .addFields(
                    { name: "👤 Usuário", value: `<@${id}>`, inline: true },
                    { name: "🆔 ID", value: id, inline: true },
                    { name: "📅 Tempo", value: dias, inline: true },
                    { name: "💻 HWID", value: user.hwid || "Não definido" }
                )
                .setColor(0x3498db)
                .setTimestamp();

            message.channel.send({ embeds: [embed] });
            return;
        }

        // ================= RESETHWID =================

        if (command === '!resethwid') {

            if (!hasPermission)
                return message.reply("❌ Sem permissão.");

            const id = args[1];
            if (!id) return message.reply("Use: !resethwid ID");

            const user = database.find(u => u.id === id);
            if (!user) return message.reply("ID não encontrado.");

            user.hwid = null;
            saveDatabase(database);

            message.reply(`🔄 HWID resetado para ${id}`);
            sendLogEmbed(id, "🔄 RESETHWID", message.author.tag);
            return;
        }

        // ================= RESETTODOS =================

        if (command === '!resettodos') {

            if (!hasPermission)
                return message.reply("❌ Sem permissão.");

            database.forEach(u => u.hwid = null);
            saveDatabase(database);

            message.reply("🔄 Todos HWIDs foram resetados.");

            const embed = new EmbedBuilder()
                .setTitle("🔄 RESET TODOS")
                .setDescription(`Executado por: ${message.author.tag}`)
                .setColor(0xe74c3c)
                .setTimestamp();

            const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
            if (logChannel) {
                logChannel.send({ embeds: [embed] });
            }

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

            message.reply(`🚫 ID ${id} desautorizado.`);
            sendLogEmbed(id, "🔴 DESAUTORIZAR", message.author.tag);
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

        if (blacklist.includes(id))
            return res.send("pc_blocked");

        const user = database.find(u => u.id === id);
        if (!user)
            return res.send("false");

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

            if (user.hwid !== hwid)
                return res.send("pc_blocked");

            return res.send(`true|9999|${username}`);
        }

        const now = new Date();
        const expireDate = new Date(user.expires);

        if (expireDate < now)
            return res.send("expired");

        if (!user.hwid) {
            user.hwid = hwid;
            saveDatabase(database);
        }

        if (user.hwid !== hwid)
            return res.send("pc_blocked");

        let diasRestantes = Math.ceil(
            (expireDate - now) / (1000 * 60 * 60 * 24)
        );

        if (diasRestantes < 1) diasRestantes = 1;

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

client.once('clientReady', () => {
    console.log(`Bot online como ${client.user.tag}`);
});

client.login(process.env.TOKEN);