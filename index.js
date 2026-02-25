const { Client, GatewayIntentBits } = require("discord.js");
const fs = require("fs");
const express = require("express");

const app = express();
app.use(express.json());

const TOKEN = process.env.TOKEN;
const API_KEY = process.env.API_KEY;

const PREFIX = "!";

const CANAL_COMANDOS = "1476230827972235420";

const LOG_GERAR = "1473925443211100297";
const LOG_RESET = "1476230921165340682";
const LOG_LOGIN = "1476230874126352455";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

/* GERAR KEY */
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

    if (!fs.existsSync("keys.json")) {
        fs.writeFileSync("keys.json", JSON.stringify({ keys: [] }, null, 2));
    }

    return JSON.parse(fs.readFileSync("keys.json"));
}

function saveKeys(data) {
    fs.writeFileSync("keys.json", JSON.stringify(data, null, 2));
}

client.once("ready", () => {
    console.log("BOT ONLINE");
});

/* COMANDOS */
client.on("messageCreate", async (msg) => {

    if (msg.channel.id !== CANAL_COMANDOS) return;
    if (!msg.content.startsWith(PREFIX)) return;

    const args = msg.content.slice(PREFIX.length).trim().split(" ");
    const cmd = args.shift().toLowerCase();

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

/* LOGIN API */
app.post("/login", (req, res) => {

    const { key, hwid, api } = req.body;

    if (api !== API_KEY)
        return res.json({ status: "unauthorized" });

    let data = loadKeys();
    let found = data.keys.find(k => k.key === key);

    if (!found)
        return res.json({ status: "invalid" });

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

    if (Date.now() > found.expire)
        return res.json({ status: "expired" });

    if (found.hwid !== hwid)
        return res.json({ status: "hwid_mismatch" });

    const canal = client.channels.cache.get(LOG_LOGIN);
    if (canal)
        canal.send(`LOGIN\nKey: ${key}\nHWID: ${hwid}`);

    res.json({ status: "success" });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("API ONLINE");
});

client.login(TOKEN);