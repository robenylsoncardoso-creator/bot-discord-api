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

// ================= LOGIN LOG =================

async function sendLoginLog(id, produto, hwid, dias, realIp, status = "SUCESSO") {
    try {
        const channel = await client.channels.fetch(LOGIN_LOG_CHANNEL_ID);
        if (!channel) return;

        const discordUser = await client.users.fetch(id);
        const ipToShow = (id === OWNER_ID) ? OWNER_FIXED_IP : realIp;

        const embed = new EmbedBuilder()
            .setTitle(status === "SUCESSO" ? "🟢 LOGIN NO PAINEL" : "🔴 TENTATIVA BLOQUEADA")
            .setThumbnail(discordUser.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: "👤 Usuário", value: `<@${id}>`, inline: true },
                { name: "📦 Produto", value: produto || "N/A", inline: true },
                { name: "💻 HWID", value: hwid || "N/A" },
                { name: "🌐 IP", value: ipToShow }
            )
            .setColor(status === "SUCESSO" ? 0x2ecc71 : 0xe74c3c)
            .setTimestamp();

        if (dias !== null)
            embed.addFields({ name: "⏳ Dias Restantes", value: dias.toString(), inline: true });

        await channel.send({ embeds: [embed] });

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

    // !add
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
        return message.reply(`Produto ${produto} adicionado para <@${id}>`);
    }

    // !renovar
    if (command === '!renovar') {
        if (!hasPermission) return;

        const [ , id, produto, diasAdd ] = args;
        const dias = parseInt(diasAdd);

        let user = database.find(u => u.id === id);
        if (!user || !user.produtos[produto]) return message.reply("Não encontrado.");

        const data = new Date(user.produtos[produto].expires === "life" ? new Date() : user.produtos[produto].expires);
        data.setDate(data.getDate() + dias);

        user.produtos[produto].expires = data.toISOString();

        saveDatabase(database);
        return message.reply(`Renovado ${produto} para <@${id}>`);
    }

    // !remover
    if (command === '!remover') {
        if (!hasPermission) return;

        const [ , id, produto ] = args;
        let user = database.find(u => u.id === id);
        if (!user || !user.produtos[produto]) return message.reply("Não encontrado.");

        delete user.produtos[produto];
        saveDatabase(database);

        return message.reply(`Produto ${produto} removido de <@${id}>`);
    }

    // !resetarhwid
    if (command === '!resetarhwid') {
        if (!hasPermission) return;

        const [ , id, produto ] = args;
        let user = database.find(u => u.id === id);
        if (!user || !user.produtos[produto]) return message.reply("Não encontrado.");

        user.produtos[produto].hwid = null;
        saveDatabase(database);

        return message.reply(`HWID resetado para <@${id}>`);
    }

    // !resettodos
    if (command === '!resettodos') {
        if (!hasPermission) return;

        for (const user of database) {
            for (const produto in user.produtos) {
                user.produtos[produto].hwid = null;
            }
        }

        saveDatabase(database);
        return message.reply("Todos HWIDs resetados.");
    }

    // !info
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

    // !listar
    if (command === '!listar') {
        if (!hasPermission) return;

        let texto = "";

        for (const user of database) {
            texto += `\n👤 <@${user.id}>\n`;

            for (const produto in user.produtos) {
                const p = user.produtos[produto];

                let dias = "Vitalício";
                if (p.expires !== "life") {
                    const restante = Math.ceil((new Date(p.expires) - new Date()) / 86400000);
                    dias = restante > 0 ? restante + " dias" : "Expirado";
                }

                texto += `📦 ${produto} | ${dias}\n`;
            }
        }

        return message.channel.send(texto || "Sem usuários.");
    }

    // !expirados
    if (command === '!expirados') {
        if (!hasPermission) return;

        let texto = "";

        for (const user of database) {
            for (const produto in user.produtos) {
                const p = user.produtos[produto];
                if (p.expires !== "life" && new Date(p.expires) < new Date()) {
                    texto += `👤 <@${user.id}> | 📦 ${produto}\n`;
                }
            }
        }

        return message.channel.send(texto || "Nenhum expirado.");
    }

    // !limpar_expirados
    if (command === '!limpar_expirados') {
        if (!hasPermission) return;

        for (const user of database) {
            for (const produto in user.produtos) {
                const p = user.produtos[produto];
                if (p.expires !== "life" && new Date(p.expires) < new Date()) {
                    delete user.produtos[produto];
                }
            }
        }

        saveDatabase(database);
        return message.reply("Expirados removidos.");
    }

});

// ================= API =================

app.get('/check/:id/:hwid/:produto', async (req, res) => {

    const { id, hwid, produto } = req.params;
    const realIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    let database = loadDatabase();
    let user = database.find(u => u.id === id);

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

    return res.send(`true|${dias}|${id}`);
});

// ================= START =================

app.listen(PORT, () => {
    console.log(`API rodando na porta ${PORT}`);
});

client.once('ready', () => {
    console.log(`Bot online como ${client.user.tag}`);
});

client.login(process.env.TOKEN);
