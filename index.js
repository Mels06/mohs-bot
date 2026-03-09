require("dotenv").config();
const express = require("express");
const axios   = require("axios");

const app = express();
app.use(express.json());

// ══════════════════════════════════════════════════════════════════════════════
// CONFIG — À remplir dans les variables d'environnement Render
// ══════════════════════════════════════════════════════════════════════════════
const TELEGRAM_TOKEN  = process.env.TELEGRAM_TOKEN  || "8629289546:AAHn6D-jFGQw2mJzX_JzMECbTaBkP-R5B-E";
const SCRIPT_URL      = process.env.SCRIPT_URL      || "https://script.google.com/macros/s/AKfycbyka_9NNspo0RpNO2I-Tb3UEWQbr61qwkzmGX3YvNwt7YcBPrS9027d-Xu9vPjLiGIE/exec";
const ADMIN_CHAT_ID   = process.env.ADMIN_CHAT_ID   || "8383314931";
const FEDAPAY_API_KEY = process.env.FEDAPAY_API_KEY || ""; // À ajouter demain

// ══════════════════════════════════════════════════════════════════════════════
// PACKS
// ══════════════════════════════════════════════════════════════════════════════
const PACKS = {
  "1": { nom: "Pack 1 – Essentiel",   telegram: 15000, whatsapp: 30000 },
  "2": { nom: "Pack 2 – Avancée",     telegram: 20000, whatsapp: 40000 },
  "3": { nom: "Pack 3 – Assistant",   telegram: 25000, whatsapp: 50000 },
  "4": { nom: "Pack 4 – Commercial",  telegram: 35000, whatsapp: 100000 },
};

// ══════════════════════════════════════════════════════════════════════════════
// APPEL GOOGLE SHEET
// ══════════════════════════════════════════════════════════════════════════════
async function callSheet(action, data = {}) {
  try {
    const res  = await fetch(SCRIPT_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...data }), redirect: "follow"
    });
    const text = await res.text();
    return JSON.parse(text);
  } catch(e) {
    console.error("❌ Sheet:", e.message);
    return { status: "error", message: e.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// TELEGRAM
// ══════════════════════════════════════════════════════════════════════════════
async function send(chatId, text, extra = {}) {
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: chatId, text, parse_mode: "Markdown", ...extra
    });
  } catch(e) { console.error("❌ Telegram:", e.message); }
}



// ══════════════════════════════════════════════════════════════════════════════
// GÉNÉRER LIEN FEDAPAY (sera activé avec la clé API)
// ══════════════════════════════════════════════════════════════════════════════
async function genererLienPaiement(idClient, montant, nom, pack) {
  if (!FEDAPAY_API_KEY) return null;
  try {
    const res = await fetch("https://api.fedapay.com/v1/transactions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${FEDAPAY_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        amount: montant,
        currency: { iso: "XOF" },
        description: `MOHS BOT — ${pack} — ${nom}`,
        merchant_reference: `MOHSBOT_${idClient}`,
        callback_url: `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/paiement-confirme`
      })
    });
    const data = await res.json();
    if (data.v1 && data.v1.token) {
      return `https://process.fedapay.com/${data.v1.token}`;
    }
    return null;
  } catch(e) {
    console.error("❌ FedaPay:", e.message);
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MENU PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════
function menuAdmin() {
  return `👑 *MOHS BOT — Panneau Admin*

👥 *Clients :*
\`nouveau [nom] [tel] [pack1/2/3/4] [telegram/whatsapp]\`
\`client [ID ou téléphone]\`
\`clients\` → tous les clients
\`actifs\` → clients actifs
\`expires\` → clients expirés
\`alerte\` → expirent dans 7 jours

💰 *Abonnements :*
\`renouveler [ID]\` → renouvellement manuel
\`suspendre [ID]\` → suspendre un client
\`reactiver [ID]\` → réactiver un client

📊 *Stats :*
\`stats\` → tableau de bord complet

ℹ️ *Aide :*
\`packs\` → voir tous les packs et prix`;
}

// ══════════════════════════════════════════════════════════════════════════════
// WEBHOOK TELEGRAM
// ══════════════════════════════════════════════════════════════════════════════
app.get("/", (req, res) => res.send("✅ MOHS BOT Admin opérationnel"));

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const message = req.body.message;
    if (!message || !message.text) return;

    const chatId = message.chat.id;
    const text   = message.text.trim();

    // ── /start ────────────────────────────────────────────────────────────────
    if (text === "/start") {
      await send(chatId, menuAdmin());
      return;
    }

    // ── PACKS ─────────────────────────────────────────────────────────────────
    if (text.toLowerCase() === "packs") {
      let msg = `📦 *CATALOGUE MOHS BOT*\n\n`;
      for (const [k, p] of Object.entries(PACKS)) {
        msg += `*Pack ${k} — ${p.nom}*\n`;
        msg += `  📱 Telegram : ${p.telegram.toLocaleString("fr-FR")} FCFA/mois\n`;
        msg += `  💬 WhatsApp : ${p.whatsapp.toLocaleString("fr-FR")} FCFA/mois\n\n`;
      }
      await send(chatId, msg);
      return;
    }

    // ── NOUVEAU CLIENT ────────────────────────────────────────────────────────
    // Format : nouveau Paul 22901234567 2 telegram
    if (text.toLowerCase().startsWith("nouveau ")) {
      const parts = text.split(" ").filter(p => p.trim());
      if (parts.length < 4) {
        await send(chatId, "⚠️ Format : `nouveau [nom] [téléphone] [pack 1/2/3/4] [telegram/whatsapp]`\nEx: `nouveau Paul 22901234567 2 telegram`");
        return;
      }
      const [, nom, telephone, packNum, plateforme = "telegram"] = parts;
      const packInfo = PACKS[packNum];
      if (!packInfo) {
        await send(chatId, "⚠️ Pack invalide. Choisir entre 1, 2, 3 ou 4.\nTape `packs` pour voir les détails.");
        return;
      }

      await send(chatId, `⏳ Création du client *${nom}*...`);

      const montant = plateforme.toLowerCase() === "whatsapp" ? packInfo.whatsapp : packInfo.telegram;
      const result  = await callSheet("add_client", {
        nom, telephone, pack: packInfo.nom,
        plateforme: plateforme.charAt(0).toUpperCase() + plateforme.slice(1),
        montant
      });

      if (result.status !== "ok") {
        await send(chatId, `❌ Erreur : ${result.message}`);
        return;
      }

      // Générer lien de paiement FedaPay
      let lienPaiement = null;
      if (FEDAPAY_API_KEY) {
        lienPaiement = await genererLienPaiement(result.id, montant, nom, packInfo.nom);
      }

      let msg = `✅ *Client créé !*\n\n`;
      msg += `🆔 ID : *${result.id}*\n`;
      msg += `👤 Nom : ${result.nom}\n`;
      msg += `📦 Pack : ${result.pack}\n`;
      msg += `💰 Montant : ${montant.toLocaleString("fr-FR")} FCFA/mois\n`;
      msg += `📅 Valide jusqu'au : *${result.date_fin}*\n\n`;

      if (lienPaiement) {
        msg += `💳 *Lien de paiement :*\n${lienPaiement}\n\n`;
        msg += `_Envoie ce lien à ${nom} pour activer son abonnement._`;
      } else {
        msg += `⚠️ _Lien FedaPay disponible dès activation de la clé API._\n`;
        msg += `En attendant, renouvèle manuellement : \`renouveler ${result.id}\``;
      }

      await send(chatId, msg);
      return;
    }

    // ── VOIR UN CLIENT ────────────────────────────────────────────────────────
    if (text.toLowerCase().startsWith("client ")) {
      const recherche = text.split(" ").slice(1).join(" ").trim();
      const result    = await callSheet("get_client", { id: recherche, telephone: recherche });

      if (result.status !== "ok") {
        await send(chatId, `❌ ${result.message}`);
        return;
      }

      const c      = result;
      const emoji  = c.statut === "ACTIF" ? "🟢" : c.statut === "EXPIRÉ" ? "🔴" : "🟡";
      const alertJ = c.jours_restants <= 3 ? "🚨" : c.jours_restants <= 7 ? "⚠️" : "";

      let msg = `👤 *Fiche Client #${c.id}*\n\n`;
      msg += `${emoji} Statut : *${c.statut}*\n`;
      msg += `👤 Nom : ${c.nom}\n`;
      msg += `📞 Tél : ${c.telephone || "—"}\n`;
      msg += `📦 Pack : ${c.pack}\n`;
      msg += `📱 Plateforme : ${c.plateforme}\n`;
      msg += `💰 Montant : ${Number(c.montant).toLocaleString("fr-FR")} FCFA/mois\n`;
      msg += `📅 Début : ${c.date_debut}\n`;
      msg += `📅 Fin : ${c.date_fin}\n`;
      msg += `⏳ Jours restants : *${c.jours_restants}* ${alertJ}\n\n`;
      msg += `⚙️ Actions :\n`;
      msg += `• \`renouveler ${c.id}\` → prolonger 30 jours\n`;
      msg += `• \`suspendre ${c.id}\` → suspendre\n`;
      msg += `• \`reactiver ${c.id}\` → réactiver`;

      await send(chatId, msg);
      return;
    }

    // ── LISTE CLIENTS ─────────────────────────────────────────────────────────
    if (["clients", "actifs", "expires", "alerte"].includes(text.toLowerCase())) {
      const filtreMap = { "clients": "tous", "actifs": "actifs", "expires": "expires", "alerte": "alerte" };
      const filtre    = filtreMap[text.toLowerCase()];
      const result    = await callSheet("get_clients", { filtre });

      if (result.status !== "ok" || result.total === 0) {
        await send(chatId, `📋 Aucun client trouvé (filtre: ${filtre}).`);
        return;
      }

      let msg = `📋 *Clients — ${filtre.toUpperCase()}* (${result.total})\n\n`;
      result.clients.forEach(c => {
        const emoji = c.statut === "ACTIF" ? "🟢" : c.statut === "EXPIRÉ" ? "🔴" : "🟡";
        const alerte = c.jours_restants <= 3 ? " 🚨" : c.jours_restants <= 7 ? " ⚠️" : "";
        msg += `${emoji} *#${c.id}* ${c.nom} — ${c.pack.replace("Pack ","P")}\n`;
        msg += `   ⏳ ${c.jours_restants}j restants${alerte} | ${c.plateforme}\n`;
      });
      msg += `\n_Tape \`client [ID]\` pour les détails_`;
      await send(chatId, msg);
      return;
    }

    // ── RENOUVELER ────────────────────────────────────────────────────────────
    if (text.toLowerCase().startsWith("renouveler ")) {
      const id     = text.split(" ")[1]?.trim();
      const result = await callSheet("renouveler", { id_client: id, moyen: "Manuel" });

      if (result.status !== "ok") {
        await send(chatId, `❌ ${result.message}`);
        return;
      }

      await send(chatId,
        `✅ *Renouvellement effectué !*\n\n👤 ${result.nom}\n📅 Nouvelle date de fin : *${result.nouvelle_fin}*\n💰 ${Number(result.montant).toLocaleString("fr-FR")} FCFA`
      );
      return;
    }

    // ── SUSPENDRE ─────────────────────────────────────────────────────────────
    if (text.toLowerCase().startsWith("suspendre ")) {
      const id     = text.split(" ")[1]?.trim();
      const result = await callSheet("suspendre", { id_client: id });
      if (result.status !== "ok") { await send(chatId, `❌ ${result.message}`); return; }
      await send(chatId, `🔴 *Client suspendu*\n\n👤 ${result.nom} (#${result.id_client})\n\nTape \`reactiver ${id}\` pour réactiver.`);
      return;
    }

    // ── RÉACTIVER ─────────────────────────────────────────────────────────────
    if (text.toLowerCase().startsWith("reactiver ")) {
      const id     = text.split(" ")[1]?.trim();
      const result = await callSheet("reactiver", { id_client: id });
      if (result.status !== "ok") { await send(chatId, `❌ ${result.message}`); return; }
      await send(chatId, `🟢 *Client réactivé*\n\n👤 ${result.nom} (#${result.id_client})`);
      return;
    }

    // ── STATS ─────────────────────────────────────────────────────────────────
    if (text.toLowerCase() === "stats") {
      const result = await callSheet("get_stats");
      if (result.status !== "ok") { await send(chatId, "⚠️ Erreur stats."); return; }

      let msg = `📊 *MOHS BOT — Tableau de bord*\n\n`;
      msg += `👥 *Abonnés :*\n`;
      msg += `  🟢 Actifs : *${result.actifs}*\n`;
      msg += `  🔴 Expirés : *${result.expires}*\n`;
      msg += `  🟡 Suspendus : *${result.suspendus}*\n`;
      msg += `  📊 Total : *${result.total}*\n\n`;
      msg += `💰 *CA Total : ${Number(result.ca_total).toLocaleString("fr-FR")} FCFA*\n\n`;
      msg += `📦 *Par pack :*\n`;
      for (const [pack, v] of Object.entries(result.par_pack || {})) {
        msg += `  • ${pack} : ${v.nb} client(s) — ${Number(v.montant).toLocaleString("fr-FR")} FCFA\n`;
      }
      await send(chatId, msg);
      return;
    }

    // ── Commande inconnue ─────────────────────────────────────────────────────
    await send(chatId, menuAdmin());

  } catch(err) {
    console.error("❌ Webhook:", err.message);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// WEBHOOK FEDAPAY — reçoit la confirmation de paiement
// ══════════════════════════════════════════════════════════════════════════════
app.post("/paiement-confirme", async (req, res) => {
  res.sendStatus(200);
  try {
    const event = req.body;
    console.log("💳 FedaPay webhook:", JSON.stringify(event));

    // Vérifier que c'est un paiement approuvé
    if (event.name !== "transaction.approved") return;

    const transaction = event.entity;
    const ref         = transaction.merchant_reference || "";

    // Extraire l'ID client depuis la ref : "MOHSBOT_001" → "001"
    if (!ref.startsWith("MOHSBOT_")) return;
    const idClient = ref.replace("MOHSBOT_", "");

    // Mettre à jour l'abonnement
    const result = await callSheet("update_abonnement", {
      id_client:    idClient,
      ref_paiement: transaction.id,
      moyen:        "FedaPay"
    });

    if (result.status === "ok") {
      console.log(`✅ Abonnement renouvelé : Client ${idClient} → ${result.nouvelle_fin}`);

      // Notifier l'admin
      if (ADMIN_CHAT_ID) {
        await send(ADMIN_CHAT_ID,
          `💰 *Paiement reçu !*\n\n👤 ${result.nom}\n🆔 Client #${idClient}\n💵 ${Number(result.montant).toLocaleString("fr-FR")} FCFA\n📅 Valide jusqu'au : *${result.nouvelle_fin}*`
        );
      }

      // Notifier le client si on a son chat_id
      const clientInfo = await callSheet("get_client", { id: idClient });
      if (clientInfo.status === "ok" && clientInfo.chat_id) {
        // Envoyer sur son bot (nécessite son bot_token)
        // À implémenter quand les bots clients seront déployés
      }
    }
  } catch(e) {
    console.error("❌ FedaPay webhook:", e.message);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// SCHEDULER — vérification quotidienne des expirations
// ══════════════════════════════════════════════════════════════════════════════
async function checkExpirations() {
  try {
    console.log("🔍 Vérification expirations...");
    const result = await callSheet("expire_check");
    if (result.status !== "ok") return;

    // Alertes J-7, J-3, J-1
    for (const a of result.alertes || []) {
      const emoji = a.jours === 1 ? "🚨" : a.jours === 3 ? "🔴" : "⚠️";
      await send(ADMIN_CHAT_ID,
        `${emoji} *Alerte expiration*\n\n👤 ${a.nom} (#${a.id})\n📦 ${a.pack}\n⏳ Expire dans *${a.jours} jour(s)*\n💰 ${Number(a.montant).toLocaleString("fr-FR")} FCFA\n\nAction : \`renouveler ${a.id}\``
      );
    }

    // Expirés aujourd'hui
    for (const e of result.expires || []) {
      await send(ADMIN_CHAT_ID,
        `❌ *Abonnement expiré*\n\n👤 ${e.nom} (#${e.id})\n📦 ${e.pack}\n💰 ${Number(e.montant).toLocaleString("fr-FR")} FCFA\n\nAction : \`renouveler ${e.id}\``
      );
    }

    if (result.total_alertes > 0 || result.total_expires > 0) {
      console.log(`📊 ${result.total_alertes} alertes, ${result.total_expires} expirés`);
    }
  } catch(e) {
    console.error("❌ Scheduler:", e.message);
  }
}

// Lancer le scheduler toutes les heures
setInterval(checkExpirations, 60 * 60 * 1000);
// Vérifier au démarrage après 10 secondes
setTimeout(checkExpirations, 10000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 MOHS BOT Admin — Port ${PORT}`));