require("dotenv").config();
const express = require("express");
const axios   = require("axios");
const crypto  = require("crypto");

const app = express();
app.use(express.json());

const TELEGRAM_TOKEN  = process.env.TELEGRAM_TOKEN  || "8629289546:AAHn6D-jFGQw2mJzX_JzMECbTaBkP-R5B-E";
const SCRIPT_URL      = process.env.SCRIPT_URL      || "https://script.google.com/macros/s/AKfycbwi2LVRQcLjtQ1LvaMOhvXPfjp_R7wTChcj2KvpI3ABKnvZX0OtaAmanKT1iTjIqBlK/exec";
const ADMIN_CHAT_ID   = process.env.ADMIN_CHAT_ID   || "8383314931";
const FEDAPAY_API_KEY = process.env.FEDAPAY_API_KEY || "";
const RESEND_API_KEY  = process.env.RESEND_API_KEY  || "";
const FEDAPAY_WEBHOOK_SECRET = process.env.FEDAPAY_WEBHOOK_SECRET || "";

function isAdmin(chatId) { return String(chatId) === String(ADMIN_CHAT_ID); }

function genererID() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return "MT-" + code;
}

const PACKS = {
  "1": { nom: "Pack 1 - Essentiel",  telegram: 15000, whatsapp: 30000 },
  "2": { nom: "Pack 2 - Avancee",    telegram: 20000, whatsapp: 40000 },
  "3": { nom: "Pack 3 - Assistant",  telegram: 25000, whatsapp: 50000 },
  "4": { nom: "Pack 4 - Commercial", telegram: 35000, whatsapp: 100000 },
};

const MOIS = {
  "janvier":1,"fevrier":2,"mars":3,"avril":4,"mai":5,"juin":6,
  "juillet":7,"aout":8,"septembre":9,"octobre":10,"novembre":11,"decembre":12
};

const CONVERSATIONS = {
  salutations: ["bonjour","bonsoir","salut","hello","hi","coucou","yo","hey"],
  quiSommes:   ["qui es tu","qui etes vous","c'est quoi mohs","que faites vous","presentez vous","presentation","vous faites quoi","tu fais quoi"],
  services:    ["services","offres","produits","bots","bot","pack","packs","prix","tarif","tarifs","combien"],
  contact:     ["contact","email","telephone","joindre","appeler","ecrire"],
  merci:       ["merci","thanks","thank you","super","parfait","ok merci","nickel"],
  aide:        ["aide","help","comment","comment ca marche","comment utiliser"],
};

function detectIntent(text) {
  const t = text.toLowerCase().trim();
  for (const [intent, mots] of Object.entries(CONVERSATIONS)) {
    if (mots.some(m => t.includes(m))) return intent;
  }
  return null;
}

function repondreConversation(intent, prenom) {
  const n = prenom ? " " + prenom : "";
  switch(intent) {
    case "salutations": return "Bonjour" + n + " ! Je suis ton assistant MOHS TECHNOLOGIE. Comment puis-je t'aider ?\n\nTape 'aide' pour voir toutes les commandes disponibles.";
    case "quiSommes":   return "MOHS TECHNOLOGIE est une structure specialisee dans la configuration de bots intelligents pour les entreprises et particuliers.\n\nNos bots peuvent gerer :\n- Les ventes et commandes\n- Le service client\n- La gestion commerciale\n- Les assistants automatises\n\nNous proposons 4 packs adaptes a tous les besoins. Tape 'packs' pour les voir !";
    case "services":    return "Nous proposons 4 packs de bots intelligents :\n\nPack 1 - Essentiel\nPack 2 - Avancee\nPack 3 - Assistant\nPack 4 - Commercial\n\nDisponibles sur Telegram et WhatsApp.\nTape 'packs' pour voir les details et tarifs !";
    case "contact":     return "Pour nous contacter :\n\nEmail : contact@mohstechnologie.com\n\nNous repondons dans les plus brefs delais !";
    case "merci":       return "Avec plaisir" + n + " ! N'hesite pas si tu as d'autres questions.";
    case "aide":        return "Voici les principales commandes :\n\n" +
      "nouveau [nom] [tel] [email] [pack 1-4] [telegram/whatsapp] - Enregistrer un client\n" +
      "nouveau ... 3 - Enregistrer pour 3 mois\n" +
      "client [ID] - Voir fiche client\n" +
      "clients / actifs / expires / alerte - Listes\n" +
      "liste pack1 / liste telegram - Listes filtrees\n" +
      "renouveler [ID] - Renouveler 1 mois\n" +
      "renouveler [ID] 3 - Renouveler 3 mois\n" +
      "suspendre [ID] / reactiver [ID]\n" +
      "solde [ID] - Envoyer lien paiement solde au client\n" +
      "stats - Tableau de bord\n" +
      "ca mars / ca 2025 / ca 01/01/2025 31/03/2025\n" +
      "commandes / commandes aujourd'hui\n" +
      "packs - Voir les tarifs";
    default: return null;
  }
}

async function callSheet(action, data = {}) {
  try {
    const res  = await fetch(SCRIPT_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...data }), redirect: "follow"
    });
    const text = await res.text();
    return JSON.parse(text);
  } catch(e) { console.error("Sheet:", e.message); return { status: "error", message: e.message }; }
}

async function send(chatId, text) {
  try {
    await axios.post("https://api.telegram.org/bot" + TELEGRAM_TOKEN + "/sendMessage", {
      chat_id: chatId, text: text
    });
  } catch(e) { console.error("Telegram:", e.response?.data?.description || e.message); }
}

// ── FEDAPAY ───────────────────────────────────────────────────────────────────
async function genererLienPaiement(idClient, montant, nom, pack, email, telephone) {
  if (!FEDAPAY_API_KEY) { console.log("FEDAPAY_API_KEY manquante"); return null; }
  // Compte FedaPay non encore valide - desactive jusqu'a validation
  if (FEDAPAY_API_KEY.startsWith("sk_test")) {
    console.log("FedaPay en mode test - lien desactive jusqu'a validation du compte");
    return null;
  }
  try {
    const res = await fetch("https://api.fedapay.com/v1/transactions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + FEDAPAY_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: montant,
        currency: { iso: "XOF" },
        description: "MOHS BOT - " + pack + " - Acompte 50% - " + nom,
        merchant_reference: "MOHSBOT_" + idClient,
        callback_url: "https://" + (process.env.RENDER_EXTERNAL_HOSTNAME || "mohs-technologie.onrender.com") + "/paiement-confirme",
        redirect_url: "https://mohstechnologie.com",
        customer: {
          firstname: nom,
          email: email && email.includes("@") ? email.trim() : undefined,
          phone_number: {
            number: String(telephone || "").replace(/[^0-9]/g, ""),
            country: "BJ"
          }
        }
      })
    });
    const data = await res.json();
    console.log("FedaPay response: " + JSON.stringify(data));
    const transaction = data["v1/transaction"];
    if (transaction && transaction.payment_url) return transaction.payment_url;
    if (transaction && transaction.payment_token) return "https://process.fedapay.com/" + transaction.payment_token;
    return null;
  } catch(e) { console.error("FedaPay:", e.message); return null; }
}

// ── RESEND MAIL ───────────────────────────────────────────────────────────────
async function envoyerMail({ email, nom, id, pack, montant, plateforme, date_fin, lienPaiement, acompte, solde }) {
  if (!RESEND_API_KEY) { console.log("RESEND_API_KEY manquante"); return false; }

  const lienHtml = lienPaiement
    ? '<p style="text-align:center;margin:30px 0;"><a href="' + lienPaiement + '" style="background:#2f74a3;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;">Payer mon acompte (' + Number(acompte).toLocaleString("fr-FR") + ' FCFA)</a></p>'
    : '<p style="color:#888;font-size:13px;text-align:center;padding:10px;background:#f0f7ff;border-radius:8px;">Le lien de paiement sera disponible prochainement.</p>';

  const acompteHtml = acompte ? `
    <tr style="background:#e8f4fb;"><td style="padding:10px 15px;color:#2f74a3;font-weight:bold;border-bottom:1px solid #eee;">Acompte a payer (50%)</td>
        <td style="padding:10px 15px;color:#2f74a3;font-weight:bold;font-size:16px;border-bottom:1px solid #eee;">${Number(acompte).toLocaleString("fr-FR")} FCFA</td></tr>
    <tr><td style="padding:10px 15px;color:#888;border-bottom:1px solid #eee;">Solde restant</td>
        <td style="padding:10px 15px;color:#555;border-bottom:1px solid #eee;">${Number(solde).toLocaleString("fr-FR")} FCFA</td></tr>` : "";

  const html = `<!DOCTYPE html><html><body style="font-family:Arial;background:#f4f4f4;padding:40px 0;">
  <table width="600" style="margin:auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
    <tr><td style="background:#1a1a2e;padding:30px;text-align:center;">
      <h1 style="color:#2f74a3;margin:0;font-size:26px;letter-spacing:2px;">MOHS TECHNOLOGIE</h1>
      <p style="color:#aaa;margin:5px 0 0;font-size:13px;">Solutions Digitales et Bots Intelligents</p>
    </td></tr>
    <tr><td style="padding:30px;">
      <h2 style="color:#1a1a2e;">Bienvenue, ${nom} !</h2>
      <p style="color:#555;line-height:1.6;">Votre abonnement a ete enregistre avec succes sur la plateforme MOHS TECHNOLOGIE. Voici votre recapitulatif :</p>
      <table width="100%" style="border:1px solid #eee;border-radius:8px;overflow:hidden;margin:20px 0;">
        <tr style="background:#1a1a2e;"><td colspan="2" style="padding:12px 15px;color:#2f74a3;font-weight:bold;letter-spacing:1px;">DETAILS ABONNEMENT</td></tr>
        <tr><td style="padding:12px 15px;color:#888;border-bottom:1px solid #eee;width:45%;">ID Client</td>
            <td style="padding:12px 15px;border-bottom:1px solid #eee;"><span style="background:#1a1a2e;color:#2f74a3;padding:4px 12px;border-radius:15px;font-family:monospace;font-weight:bold;">${id}</span></td></tr>
        <tr style="background:#f9f9f9;"><td style="padding:12px 15px;color:#888;border-bottom:1px solid #eee;">Pack souscrit</td>
            <td style="padding:12px 15px;font-weight:bold;border-bottom:1px solid #eee;">${pack}</td></tr>
        <tr><td style="padding:12px 15px;color:#888;border-bottom:1px solid #eee;">Plateforme</td>
            <td style="padding:12px 15px;border-bottom:1px solid #eee;">${plateforme}</td></tr>
        <tr style="background:#f9f9f9;"><td style="padding:12px 15px;color:#888;border-bottom:1px solid #eee;">Montant mensuel</td>
            <td style="padding:12px 15px;font-weight:bold;border-bottom:1px solid #eee;">${Number(montant).toLocaleString("fr-FR")} FCFA</td></tr>
        ${acompteHtml}
        <tr><td style="padding:12px 15px;color:#888;">Valide jusqu'au</td>
            <td style="padding:12px 15px;font-weight:bold;">${date_fin}</td></tr>
      </table>
      ${lienHtml}
      <p style="color:#555;font-size:14px;line-height:1.6;">Conservez votre ID <strong style="color:#2f74a3;">${id}</strong> pour tout support ou renouvellement.</p>
      <p style="color:#555;font-size:14px;">Contact : <a href="mailto:contact@mohstechnologie.com" style="color:#2f74a3;">contact@mohstechnologie.com</a></p>
    </td></tr>
    <tr><td style="background:#1a1a2e;padding:20px;text-align:center;">
      <p style="color:#2f74a3;margin:0;font-weight:bold;letter-spacing:1px;">MOHS TECHNOLOGIE</p>
      <p style="color:#666;margin:5px 0 0;font-size:12px;">contact@mohstechnologie.com</p>
      <p style="color:#444;margin:5px 0 0;font-size:11px;">2025 MOHS TECHNOLOGIE - Tous droits reserves</p>
    </td></tr>
  </table>
</body></html>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": "Bearer " + RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "MOHS TECHNOLOGIE <contact@mohstechnologie.com>",
        to: [email],
        subject: "Bienvenue chez MOHS TECHNOLOGIE - " + pack,
        html
      })
    });
    const data = await res.json();
    if (data.id) { console.log("Mail envoye a " + email); return true; }
    console.error("Resend:", JSON.stringify(data)); return false;
  } catch(e) { console.error("Mail:", e.message); return false; }
}

// ── WEBHOOK ───────────────────────────────────────────────────────────────────

async function envoyerMailSolde({ email, nom, id, pack, montant, solde, lienPaiement }) {
  if (!RESEND_API_KEY) return false;

  const lienHtml = lienPaiement
    ? '<p style="text-align:center;margin:30px 0;"><a href="' + lienPaiement + '" style="background:#2f74a3;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;">Payer mon solde (' + Number(solde).toLocaleString("fr-FR") + ' FCFA)</a></p>'
    : '<p style="color:#888;font-size:13px;text-align:center;">Lien de paiement non disponible.</p>';

  const html = `<!DOCTYPE html><html><body style="font-family:Arial;background:#f4f4f4;padding:40px 0;">
  <table width="600" style="margin:auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
    <tr><td style="background:#1a1a2e;padding:30px;text-align:center;">
      <h1 style="color:#2f74a3;margin:0;font-size:26px;letter-spacing:2px;">MOHS TECHNOLOGIE</h1>
      <p style="color:#aaa;margin:5px 0 0;font-size:13px;">Solutions Digitales et Bots Intelligents</p>
    </td></tr>
    <tr><td style="padding:30px;">
      <h2 style="color:#1a1a2e;">Bonjour, ${nom} !</h2>
      <p style="color:#555;line-height:1.6;">Votre bot est pret. Voici le lien pour regler le solde de votre abonnement :</p>
      <table width="100%" style="border:1px solid #eee;border-radius:8px;overflow:hidden;margin:20px 0;">
        <tr style="background:#1a1a2e;"><td colspan="2" style="padding:12px 15px;color:#2f74a3;font-weight:bold;">SOLDE A REGLER</td></tr>
        <tr><td style="padding:12px 15px;color:#888;border-bottom:1px solid #eee;width:45%;">ID Client</td>
            <td style="padding:12px 15px;border-bottom:1px solid #eee;"><span style="background:#1a1a2e;color:#2f74a3;padding:4px 12px;border-radius:15px;font-family:monospace;font-weight:bold;">${id}</span></td></tr>
        <tr style="background:#f9f9f9;"><td style="padding:12px 15px;color:#888;border-bottom:1px solid #eee;">Pack</td>
            <td style="padding:12px 15px;font-weight:bold;border-bottom:1px solid #eee;">${pack}</td></tr>
        <tr><td style="padding:12px 15px;color:#888;border-bottom:1px solid #eee;">Montant total</td>
            <td style="padding:12px 15px;border-bottom:1px solid #eee;">${Number(montant).toLocaleString("fr-FR")} FCFA</td></tr>
        <tr style="background:#e8f4fb;"><td style="padding:12px 15px;color:#2f74a3;font-weight:bold;">Solde a payer</td>
            <td style="padding:12px 15px;color:#2f74a3;font-weight:bold;font-size:18px;">${Number(solde).toLocaleString("fr-FR")} FCFA</td></tr>
      </table>
      ${lienHtml}
      <p style="color:#555;font-size:14px;">Pour tout support, contactez-nous : <a href="mailto:contact@mohstechnologie.com" style="color:#2f74a3;">contact@mohstechnologie.com</a></p>
    </td></tr>
    <tr><td style="background:#1a1a2e;padding:20px;text-align:center;">
      <p style="color:#2f74a3;margin:0;font-weight:bold;">MOHS TECHNOLOGIE</p>
      <p style="color:#666;margin:5px 0 0;font-size:12px;">contact@mohstechnologie.com</p>
    </td></tr>
  </table>
</body></html>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": "Bearer " + RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "MOHS TECHNOLOGIE <contact@mohstechnologie.com>",
        to: [email],
        subject: "Reglement du solde - MOHS TECHNOLOGIE - " + pack,
        html
      })
    });
    const data = await res.json();
    if (data.id) { console.log("Mail solde envoye a " + email); return true; }
    console.error("Resend solde:", JSON.stringify(data)); return false;
  } catch(e) { console.error("Mail solde:", e.message); return false; }
}

app.get("/", (req, res) => res.send("MOHS BOT Admin operationnel"));

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const message = req.body.message;
    if (!message || !message.text) return;
    const chatId = message.chat.id;
    const text   = message.text.trim();
    const prenom = message.from?.first_name || "";

    if (!isAdmin(chatId)) {
      await send(chatId, "Bonjour " + prenom + " ! Ce service est reserve a un usage interne.\nContact : contact@mohstechnologie.com");
      return;
    }

    if (text === "/start") {
      await send(chatId, "Bonjour " + prenom + " ! Content de te voir.\n\nJe suis ton assistant MOHS TECHNOLOGIE. Je gere tes clients, abonnements, stats et finances.\n\nTape 'aide' pour voir toutes les commandes disponibles.");
      return;
    }

    if (text.toLowerCase() === "packs") {
      let msg = "CATALOGUE MOHS TECHNOLOGIE\n\n";
      for (const [k, p] of Object.entries(PACKS)) {
        msg += "Pack " + k + " - " + p.nom + "\n";
        msg += "  Telegram : " + p.telegram.toLocaleString("fr-FR") + " FCFA/mois\n";
        msg += "  WhatsApp : " + p.whatsapp.toLocaleString("fr-FR") + " FCFA/mois\n\n";
      }
      await send(chatId, msg);
      return;
    }

    // NOUVEAU CLIENT
    if (text.toLowerCase().startsWith("nouveau ")) {
      const parts = text.split(" ").filter(p => p.trim());
      if (parts.length < 6) {
        await send(chatId, "Format :\nnouveau [nom] [tel] [email] [pack 1-4] [telegram/whatsapp] [nb_mois optionnel]\n\nEx:\nnouveau Paul 22901234567 paul@gmail.com 2 telegram\nnouveau Paul 22901234567 paul@gmail.com 2 telegram 3");
        return;
      }
      const [, nom, telephone, email, packNum, plateforme = "telegram"] = parts;
      const nbMois = parseInt(parts[6]) || 1;
      if (!email.includes("@")) { await send(chatId, "Email invalide."); return; }
      const packInfo = PACKS[packNum];
      if (!packInfo) { await send(chatId, "Pack invalide. Tape 'packs' pour voir les details."); return; }

      const idClient = genererID();
      await send(chatId, "Enregistrement de " + nom + " en cours...");

      const montant      = plateforme.toLowerCase() === "whatsapp" ? packInfo.whatsapp : packInfo.telegram;
      const montantTotal = montant * nbMois;
      const acompte      = Math.round(montantTotal / 2);
      const solde        = montantTotal - acompte;

      const result = await callSheet("add_client", {
        id: idClient, nom, telephone, email,
        pack: packInfo.nom,
        plateforme: plateforme.charAt(0).toUpperCase() + plateforme.slice(1),
        montant, nb_mois: nbMois
      });

      if (result.status !== "ok") { await send(chatId, "Erreur : " + result.message); return; }

      // Générer lien FedaPay pour l'acompte
      let lienPaiement = null;
      if (FEDAPAY_API_KEY) {
        lienPaiement = await genererLienPaiement(idClient, acompte, nom, packInfo.nom, email, telephone);
      }

      // Envoyer mail
      const mailEnvoye = await envoyerMail({
        email, nom, id: idClient, pack: packInfo.nom, montant,
        plateforme: plateforme.charAt(0).toUpperCase() + plateforme.slice(1),
        date_fin: result.date_fin, lienPaiement, acompte, solde
      });

      let msg = "Client enregistre !\n\n";
      msg += "ID : " + idClient + "\n";
      msg += "Nom : " + nom + "\n";
      msg += "Tel : " + telephone + "\n";
      msg += "Email : " + email + "\n";
      msg += "Pack : " + packInfo.nom + "\n";
      msg += "Plateforme : " + plateforme + "\n";
      msg += "Duree : " + nbMois + " mois\n";
      msg += "Montant total : " + montantTotal.toLocaleString("fr-FR") + " FCFA\n";
      msg += "Acompte (50%) : " + acompte.toLocaleString("fr-FR") + " FCFA\n";
      msg += "Solde restant : " + solde.toLocaleString("fr-FR") + " FCFA\n";
      msg += "Valide jusqu'au : " + result.date_fin + "\n\n";
      msg += lienPaiement ? "Lien FedaPay genere ✅\n" : "Lien FedaPay non genere\n";
      msg += mailEnvoye ? "Mail envoye a " + email + " ✅" : "Mail non envoye";
      await send(chatId, msg);
      return;
    }

    // FICHE CLIENT
    if (text.toLowerCase().startsWith("client ")) {
      const recherche = text.split(" ").slice(1).join(" ").trim();
      const result    = await callSheet("get_client", { id: recherche, telephone: recherche });
      if (result.status !== "ok") { await send(chatId, "Client introuvable : " + recherche); return; }
      const c = result;
      let msg = "Fiche Client\n-------------------\n";
      msg += "Statut : " + c.statut + "\n";
      msg += "ID : " + c.id + "\n";
      msg += "Nom : " + c.nom + "\n";
      msg += "Tel : " + (c.telephone || "-") + "\n";
      msg += "Email : " + (c.email || "-") + "\n";
      msg += "Pack : " + c.pack + "\n";
      msg += "Plateforme : " + c.plateforme + "\n";
      msg += "Montant : " + Number(c.montant).toLocaleString("fr-FR") + " FCFA/mois\n";
      msg += "Debut : " + c.date_debut + "\n";
      msg += "Fin : " + c.date_fin + "\n";
      msg += "Jours restants : " + c.jours_restants + "\n\n";
      msg += "Actions :\nrenouveler " + c.id + "\nrenouveler " + c.id + " 3\nsuspendre " + c.id + "\nreactiver " + c.id;
      await send(chatId, msg);
      return;
    }

    // LISTES SIMPLES
    if (["clients","actifs","expires","alerte"].includes(text.toLowerCase())) {
      const filtreMap = { "clients":"tous","actifs":"actifs","expires":"expires","alerte":"alerte" };
      const filtre = filtreMap[text.toLowerCase()];
      const result = await callSheet("get_clients", { filtre });
      if (result.status !== "ok" || result.total === 0) { await send(chatId, "Aucun client trouve."); return; }
      let msg = "Clients - " + filtre.toUpperCase() + " (" + result.total + ")\n\n";
      result.clients.forEach(c => {
        const alerte = c.jours_restants <= 3 ? " !!!" : c.jours_restants <= 7 ? " !" : "";
        msg += c.id + " " + c.nom + " - " + c.pack.replace("Pack ","P") + "\n";
        msg += "   " + c.jours_restants + "j | " + c.plateforme + alerte + "\n";
      });
      msg += "\nTape client [ID] pour les details";
      await send(chatId, msg);
      return;
    }

    // LISTE FILTREE
    if (text.toLowerCase().startsWith("liste ")) {
      const filtre = text.split(" ").slice(1).join(" ").trim().toLowerCase();
      const result = await callSheet("get_liste", { filtre });
      if (result.status !== "ok" || result.total === 0) { await send(chatId, "Aucun client trouve pour : " + filtre); return; }
      let msg = "Liste - " + filtre.toUpperCase() + " (" + result.total + ")\n\n";
      result.clients.forEach(c => {
        msg += c.id + " " + c.nom + "\n";
        msg += "   " + c.pack + " | " + c.plateforme + " | " + Number(c.montant).toLocaleString("fr-FR") + " FCFA | " + c.statut + "\n";
      });
      await send(chatId, msg);
      return;
    }

    // RENOUVELER
    if (text.toLowerCase().startsWith("renouveler ")) {
      const parts  = text.split(" ");
      const id     = parts[1]?.trim();
      const nbMois = parseInt(parts[2]) || 1;
      const result = await callSheet("renouveler", { id_client: id, moyen: "Manuel", nb_mois: nbMois });
      if (result.status !== "ok") { await send(chatId, "Erreur : " + result.message); return; }
      await send(chatId, "Renouvellement effectue !\n\nNom : " + result.nom + "\nID : " + id + "\nDuree : " + nbMois + " mois\nNouvelle fin : " + result.nouvelle_fin + "\nMontant : " + Number(result.montant * nbMois).toLocaleString("fr-FR") + " FCFA");
      return;
    }

    // SUSPENDRE
    if (text.toLowerCase().startsWith("suspendre ")) {
      const id = text.split(" ")[1]?.trim();
      const result = await callSheet("suspendre", { id_client: id });
      if (result.status !== "ok") { await send(chatId, "Erreur : " + result.message); return; }
      await send(chatId, "Client suspendu\nNom : " + result.nom + "\nID : " + id + "\n\nTape reactiver " + id + " pour reactiver.");
      return;
    }

    // REACTIVER
    if (text.toLowerCase().startsWith("reactiver ")) {
      const id = text.split(" ")[1]?.trim();
      const result = await callSheet("reactiver", { id_client: id });
      if (result.status !== "ok") { await send(chatId, "Erreur : " + result.message); return; }
      await send(chatId, "Client reactive\nNom : " + result.nom + "\nID : " + id);
      return;
    }

    // CA
    if (text.toLowerCase().startsWith("ca ")) {
      const args = text.split(" ").slice(1);
      let debut = "", fin = "";
      if (args.length === 1 && isNaN(args[0]) && MOIS[args[0].toLowerCase()]) {
        const m = MOIS[args[0].toLowerCase()], y = new Date().getFullYear();
        const pad = n => String(n).padStart(2,"0");
        debut = pad(1)+"/"+pad(m)+"/"+y; fin = pad(new Date(y,m,0).getDate())+"/"+pad(m)+"/"+y;
      } else if (args.length === 1 && !isNaN(args[0]) && args[0].length === 4) {
        debut = "01/01/"+args[0]; fin = "31/12/"+args[0];
      } else if (args.length === 2) {
        debut = args[0]; fin = args[1];
      } else { await send(chatId, "Format :\nca mars\nca 2025\nca 01/01/2025 31/03/2025"); return; }
      const result = await callSheet("get_ca", { date_debut: debut, date_fin: fin });
      if (result.status !== "ok") { await send(chatId, "Erreur : " + result.message); return; }
      let msg = "Chiffre d'Affaires\nPeriode : " + debut + " au " + fin + "\n-------------------\n";
      msg += "CA Total : " + Number(result.ca_total).toLocaleString("fr-FR") + " FCFA\n";
      msg += "Nb paiements : " + result.nb_paiements + "\n\nPar pack :\n";
      for (const [pack, v] of Object.entries(result.par_pack || {})) {
        msg += "  " + pack + " : " + v.nb + " - " + Number(v.montant).toLocaleString("fr-FR") + " FCFA\n";
      }
      await send(chatId, msg);
      return;
    }

    // COMMANDES
    if (text.toLowerCase().startsWith("commandes")) {
      const aujourdhui = text.toLowerCase().includes("aujourd");
      const result = await callSheet("get_commandes", { aujourd_hui: aujourdhui });
      if (result.status !== "ok" || result.total === 0) { await send(chatId, "Aucune commande trouvee."); return; }
      let msg = (aujourdhui ? "Commandes du jour" : "Toutes les commandes") + " (" + result.total + ")\n\n";
      result.commandes.forEach(c => {
        msg += c.date + " | " + c.nom + " | " + c.pack + "\n";
        msg += "   " + Number(c.montant).toLocaleString("fr-FR") + " FCFA | " + c.moyen + "\n";
      });
      msg += "\nTotal : " + Number(result.ca).toLocaleString("fr-FR") + " FCFA";
      await send(chatId, msg);
      return;
    }

    // STATS
    if (text.toLowerCase() === "stats") {
      const result = await callSheet("get_stats");
      if (result.status !== "ok") { await send(chatId, "Erreur stats."); return; }
      let msg = "MOHS TECHNOLOGIE - Tableau de bord\n-------------------\n";
      msg += "Abonnes :\n  Actifs : " + result.actifs + "\n  Expires : " + result.expires + "\n  Suspendus : " + result.suspendus + "\n  Total : " + result.total + "\n\n";
      msg += "CA Total : " + Number(result.ca_total).toLocaleString("fr-FR") + " FCFA\n";
      msg += "CA ce mois : " + Number(result.ca_mois).toLocaleString("fr-FR") + " FCFA\n\n";
      msg += "Par pack :\n";
      for (const [pack, v] of Object.entries(result.par_pack || {})) {
        msg += "  " + pack + " : " + v.nb + " client(s) - " + Number(v.montant).toLocaleString("fr-FR") + " FCFA\n";
      }
      msg += "\nPar plateforme :\n  Telegram : " + (result.par_plateforme?.telegram||0) + "\n  WhatsApp : " + (result.par_plateforme?.whatsapp||0);
      await send(chatId, msg);
      return;
    }

    // SOLDE
    if (text.toLowerCase().startsWith("solde ")) {
      const id = text.split(" ")[1]?.trim();
      if (!id) { await send(chatId, "Format : solde [ID]\n\nEx: solde MT-X7K2P"); return; }

      await send(chatId, "Generation du lien de solde pour " + id + " en cours...");

      const client = await callSheet("get_client", { id });
      if (client.status !== "ok") { await send(chatId, "Client introuvable : " + id); return; }

      const montantTotal = Number(client.montant);
      const solde        = Math.round(montantTotal / 2);

      let lienPaiement = null;
      if (FEDAPAY_API_KEY) {
        lienPaiement = await genererLienPaiement(id, solde, client.nom, client.pack, client.email, client.telephone);
      }

      // Mail au client
      const mailEnvoye = client.email ? await envoyerMailSolde({
        email: client.email, nom: client.nom, id,
        pack: client.pack, montant: montantTotal, solde, lienPaiement
      }) : false;

      // Alerte Telegram admin
      let msg = "Lien solde genere !\n\n";
      msg += "ID : " + id + "\n";
      msg += "Nom : " + client.nom + "\n";
      msg += "Pack : " + client.pack + "\n";
      msg += "Solde (50%) : " + solde.toLocaleString("fr-FR") + " FCFA\n\n";
      msg += lienPaiement ? "Lien FedaPay :\n" + lienPaiement + "\n\n" : "Lien FedaPay non genere\n\n";
      msg += mailEnvoye ? "Mail envoye a " + client.email + " \u2705" : "Mail non envoye";
      await send(chatId, msg);
      return;
    }

    // CONVERSATION NATURELLE
    const intent = detectIntent(text);
    if (intent) { await send(chatId, repondreConversation(intent, prenom)); return; }

    await send(chatId, "Je n'ai pas compris. Tape 'aide' pour voir toutes les commandes disponibles.");

  } catch(err) { console.error("Webhook:", err.message); }
});

app.post("/paiement-confirme", async (req, res) => {
  res.sendStatus(200);
  try {
    const event = req.body;
    if (event.name !== "transaction.approved") return;
    const transaction = event.entity;
    const ref = transaction.merchant_reference || "";
    if (!ref.startsWith("MOHSBOT_")) return;
    const idClient = ref.replace("MOHSBOT_", "");
    const result = await callSheet("update_abonnement", { id_client: idClient, ref_paiement: transaction.id, moyen: "FedaPay" });
    if (result.status === "ok") {
      await send(ADMIN_CHAT_ID, "Paiement recu !\n\nNom : " + result.nom + "\nID : " + idClient + "\nMontant : " + Number(result.montant).toLocaleString("fr-FR") + " FCFA\nValide jusqu'au : " + result.nouvelle_fin);
    }
  } catch(e) { console.error("FedaPay webhook:", e.message); }
});

async function checkExpirations() {
  try {
    const result = await callSheet("expire_check");
    if (result.status !== "ok") return;
    for (const a of result.alertes || []) {
      const urgence = a.jours === 1 ? "URGENT" : a.jours === 3 ? "ATTENTION" : "INFO";
      await send(ADMIN_CHAT_ID, urgence + " - Expiration dans " + a.jours + " jour(s)\nNom : " + a.nom + "\nID : " + a.id + "\nPack : " + a.pack + "\nMontant : " + Number(a.montant).toLocaleString("fr-FR") + " FCFA\n\nAction : renouveler " + a.id);
    }
    for (const e of result.expires || []) {
      await send(ADMIN_CHAT_ID, "Abonnement expire\nNom : " + e.nom + "\nID : " + e.id + "\nPack : " + e.pack + "\nMontant : " + Number(e.montant).toLocaleString("fr-FR") + " FCFA\n\nAction : renouveler " + e.id);
    }
  } catch(e) { console.error("Scheduler:", e.message); }
}

setInterval(checkExpirations, 60 * 60 * 1000);
setTimeout(checkExpirations, 10000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("MOHS BOT Admin - Port " + PORT));