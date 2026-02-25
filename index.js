const { Client, GatewayIntentBits } = require("discord.js");
const fs = require("fs");
const express = require("express");

const app = express();
app.use(express.json());

const TOKEN = process.env.TOKEN;

/* CONFIG */
const CANAL_COMANDOS = "1476230921165340682";

const LOG_GERAR = "1473925443211100297";
const LOG_RESET = "1476230874126352455";
const LOG_LOGIN = "1476230827972235420";

/* BOT */
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

/* GERADOR KEY */
function gerarKey() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let key = "";

    for (let i = 0; i < 20; i++) {
        key += chars[Math.floor(Math.random() * chars.length)];
        if ((i + 1) % 5 == 0 && i != 19) key += "-";
    }

    return key;
}

/* JSON */
function loadKeys() {
    return JSON.parse(fs.readFileSync("keys.json"));
}

function saveKeys(data) {
    fs.writeFileSync("keys.json", JSON.stringify(data, null, 2));
}

/* BOT ONLINE */
client.once("ready", () => {
    console.log("BOT ONLINE");
});

/* COMANDOS */
client.on("messageCreate", async (msg) => {

    if (msg.channel.id !== CANAL_COMANDOS) return;
    if (!msg.content.startsWith(PREFIX)) return;

    const args = msg.content.slice(PREFIX.length).trim().split(" ");
    const cmd = args.shift().toLowerCase();

    /* GERAR KEY */
    if (cmd === "gerarkey") {

        if (!msg.member.permissions.has("Administrator"))
            return msg.reply("Sem permissão.");

        let dias = parseInt(args[0]);
        if (!dias) return msg.reply("Use: !gerarkey 7");

        let data = loadKeys();

        const key = gerarKey();

        data.keys.push({
            key,
            dias,
            expire: null,
            hwid: null,
            ativada: false
        });

        saveKeys(data);

        msg.reply("Key criada:\n```" + key + "```");

        const canal = client.channels.cache.get(LOG_GERAR);
        if (canal)
            canal.send(`KEY GERADA\nKey: ${key}\nDias: ${dias}\nPor: ${msg.author.tag}`);
    }

    /* RESET KEY */
    if (cmd === "resetkey") {

        if (!msg.member.permissions.has("Administrator"))
            return msg.reply("Sem permissão.");

        const key = args[0];
        if (!key) return msg.reply("Use: !resetkey KEY");

        let data = loadKeys();

        let found = data.keys.find(k => k.key === key);
        if (!found) return msg.reply("Key não encontrada.");

        found.hwid = null;
        found.ativada = false;
        found.expire = null;

        saveKeys(data);

        msg.reply("Key resetada.");

        const canal = client.channels.cache.get(LOG_RESET);
        if (canal)
            canal.send(`RESET KEY\nKey: ${key}\nPor: ${msg.author.tag}`);
    }
});

/* ================= API ================= */

/* LOGIN */
app.post("/login", (req, res) => {

    const { key, hwid } = req.body;

    let data = loadKeys();
    let found = data.keys.find(k => k.key === key);

    if (!found)
        return res.json({ status: "invalid" });

    /* PRIMEIRO LOGIN */
    if (!found.ativada) {

        found.hwid = hwid;
        found.ativada = true;
        found.expire = Date.now() + (found.dias * 86400000);

        saveKeys(data);

        const canal = client.channels.cache.get(LOG_LOGIN);
        if (canal)
            canal.send(`PRIMEIRO LOGIN\nKey: ${key}\nHWID: ${hwid}`);

        return res.json({ status: "success" });
    }

    /* KEY EXPIRADA */
    if (Date.now() > found.expire)
        return res.json({ status: "expired" });

    /* HWID ERRADO */
    if (found.hwid !== hwid)
        return res.json({ status: "hwid_mismatch" });

    /* LOGIN NORMAL */
    const canal = client.channels.cache.get(LOG_LOGIN);
    if (canal)
        canal.send(`LOGIN\nKey: ${key}\nHWID: ${hwid}`);

    res.json({ status: "success" });
});

/* API */
app.listen(3000, () => {
    console.log("API ONLINE");
});

client.login(TOKEN);