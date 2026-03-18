require("dotenv").config();
const express  = require("express");
const axios    = require("axios");
const { FedaPay, Transaction } = require("fedapay");

const app = express();
app.use(express.json());

const TELEGRAM_TOKEN  = process.env.TELEGRAM_TOKEN  || "8629289546:AAHn6D-jFGQw2mJzX_JzMECbTaBkP-R5B-E";
const SCRIPT_URL      = process.env.SCRIPT_URL      || "https://script.google.com/macros/s/AKfycbzV_MpQNqQoYj3detOOQ7rQLAEQhAXQjqAkoWdBX43z3eVBXmUg9hTddCJmvm95hWTt/exec";
const ADMIN_CHAT_ID   = process.env.ADMIN_CHAT_ID   || "8383314931";
const FEDAPAY_API_KEY = process.env.FEDAPAY_API_KEY || "";
const RESEND_API_KEY  = process.env.RESEND_API_KEY  || "";

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
  quiSommes:   ["qui es tu","qui etes vous","que faites vous","presentez vous","tu fais quoi"],
  services:    ["services","offres","produits","bots","bot","pack","packs","prix","tarif","combien"],
  contact:     ["contact","email","telephone","joindre","appeler","ecrire"],
  merci:       ["merci","thanks","super","parfait","ok merci","nickel"],
  aide:        ["aide","help","comment","comment ca marche"],
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
    case "salutations": return "Bonjour" + n + " ! Je suis ton assistant MOHS TECHNOLOGIE.\n\nTape 'aide' pour voir toutes les commandes.";
    case "quiSommes":   return "MOHS TECHNOLOGIE est specialisee dans la configuration de bots intelligents.\n\nTape 'packs' pour voir nos offres !";
    case "services":    return "Nous proposons 4 packs de bots.\nTape 'packs' pour les tarifs !";
    case "contact":     return "Contact : contact@mohstechnologie.com";
    case "merci":       return "Avec plaisir" + n + " !";
    case "aide":        return "Commandes disponibles :\n\n" +
      "nouveau [nom], [entreprise], [tel] [email] [pack] [plateforme]\n" +
      "client [ID] - Fiche client\n" +
      "clients / actifs / expires / alerte\n" +
      "liste pack1 / liste telegram\n" +
      "tester [ID] - Activer pour test\n" +
      "solde [ID] [url bot] [url sheets] - Envoyer lien paiement solde\n" +
      "livrer [ID] - Livraison manuelle\n" +
      "renouveler [ID] / renouveler [ID] 3\n" +
      "suspendre [ID] / reactiver [ID]\n" +
      "nombot [ID] [nom]\n" +
      "description [ID] [texte]\n" +
      "bots / bots afaire / bots encours / bots livre\n" +
      "bot encours [ID] / bot fait [ID]\n" +
      "stats / ca mars / ca 2025\n" +
      "commandes / commandes aujourd'hui\n" +
      "packs";
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

function getPrixFromPack(pack, plateforme) {
  const p  = String(pack||"").toLowerCase();
  const pl = String(plateforme||"telegram").toLowerCase();
  if (p.includes("1") || p.includes("essentiel"))  return pl.includes("whatsapp") ? 30000 : 15000;
  if (p.includes("2") || p.includes("avanc"))      return pl.includes("whatsapp") ? 40000 : 20000;
  if (p.includes("3") || p.includes("assistant"))  return pl.includes("whatsapp") ? 50000 : 25000;
  if (p.includes("4") || p.includes("commercial")) return pl.includes("whatsapp") ? 100000 : 35000;
  return 15000;
}

// ── FEDAPAY ───────────────────────────────────────────────────────────────────
async function genererLienPaiement(reference, montant, nom, pack, email) {
  if (!FEDAPAY_API_KEY) { console.log("FEDAPAY_API_KEY manquante"); return null; }
  try {
    FedaPay.setApiKey(FEDAPAY_API_KEY);
    FedaPay.setEnvironment("live");
    const transaction = await Transaction.create({
      description: "MOHS BOT - " + pack + " - " + nom,
      amount: montant,
      currency: { iso: "XOF" },
      merchant_reference: "MOHSBOT_" + reference,
      customer: {
        firstname: nom,
        email: email && email.includes("@") ? email.trim() : "client@mohstechnologie.com"
      }
    });
    console.log("FedaPay transaction ID: " + transaction.id);
    const token     = await transaction.generateToken();
    const tokenData = JSON.parse(JSON.stringify(token));
    console.log("FedaPay token: " + JSON.stringify(tokenData));
    if (tokenData.url)   return tokenData.url;
    if (tokenData.token) return "https://process.fedapay.com/" + tokenData.token;
    return null;
  } catch(e) { console.error("FedaPay:", e.message); return null; }
}

// ── MAIL BIENVENUE ────────────────────────────────────────────────────────────
async function envoyerMailBienvenue({ email, nom, id, pack, montant, plateforme, lienPaiement, acompte, solde }) {
  if (!RESEND_API_KEY) return false;
  const lienHtml = lienPaiement
    ? '<p style="text-align:center;margin:30px 0;"><a href="' + lienPaiement + '" style="background:#2f74a3;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;">Payer mon acompte (' + Number(acompte).toLocaleString("fr-FR") + ' FCFA)</a></p>'
    : '<p style="color:#888;font-size:13px;text-align:center;padding:10px;background:#f0f7ff;border-radius:8px;">Le lien de paiement vous sera envoye prochainement.</p>';
  const acompteHtml = acompte ? `
    <tr style="background:#e8f4fb;"><td style="padding:10px 15px;color:#2f74a3;font-weight:bold;border-bottom:1px solid #eee;">Acompte a payer (50%)</td>
        <td style="padding:10px 15px;color:#2f74a3;font-weight:bold;font-size:16px;border-bottom:1px solid #eee;">${Number(acompte).toLocaleString("fr-FR")} FCFA</td></tr>
    <tr><td style="padding:10px 15px;color:#888;border-bottom:1px solid #eee;">Solde restant</td>
        <td style="padding:10px 15px;color:#555;border-bottom:1px solid #eee;">${Number(solde).toLocaleString("fr-FR")} FCFA</td></tr>` : "";
  const html = `<!DOCTYPE html><html><body style="font-family:Arial;background:#f4f4f4;padding:40px 0;">
  <table width="600" style="margin:auto;background:#fff;border-radius:12px;overflow:hidden;">
    <tr><td style="background:#1a1a2e;padding:30px;text-align:center;">
      <h1 style="color:#2f74a3;margin:0;">MOHS TECHNOLOGIE</h1>
      <p style="color:#aaa;margin:5px 0 0;font-size:13px;">Solutions Digitales et Bots Intelligents</p>
    </td></tr>
    <tr><td style="padding:30px;">
      <h2 style="color:#1a1a2e;">Bienvenue, ${nom} !</h2>
      <p style="color:#555;">Votre demande a ete enregistree. Voici votre recapitulatif :</p>
      <table width="100%" style="border:1px solid #eee;border-radius:8px;overflow:hidden;margin:20px 0;">
        <tr style="background:#1a1a2e;"><td colspan="2" style="padding:12px 15px;color:#2f74a3;font-weight:bold;">DETAILS ABONNEMENT</td></tr>
        <tr><td style="padding:12px 15px;color:#888;border-bottom:1px solid #eee;width:45%;">ID Client</td>
            <td style="padding:12px 15px;border-bottom:1px solid #eee;"><span style="background:#1a1a2e;color:#2f74a3;padding:4px 12px;border-radius:15px;font-family:monospace;font-weight:bold;">${id}</span></td></tr>
        <tr style="background:#f9f9f9;"><td style="padding:12px 15px;color:#888;border-bottom:1px solid #eee;">Pack</td>
            <td style="padding:12px 15px;font-weight:bold;border-bottom:1px solid #eee;">${pack}</td></tr>
        <tr><td style="padding:12px 15px;color:#888;border-bottom:1px solid #eee;">Plateforme</td>
            <td style="padding:12px 15px;border-bottom:1px solid #eee;">${plateforme}</td></tr>
        <tr style="background:#f9f9f9;"><td style="padding:12px 15px;color:#888;border-bottom:1px solid #eee;">Montant mensuel</td>
            <td style="padding:12px 15px;font-weight:bold;border-bottom:1px solid #eee;">${Number(montant).toLocaleString("fr-FR")} FCFA</td></tr>
        ${acompteHtml}
      </table>
      ${lienHtml}
      <p style="color:#555;font-size:14px;">Conservez votre ID <strong style="color:#2f74a3;">${id}</strong> pour tout support.</p>
      <p style="color:#555;font-size:14px;">Contact : <a href="mailto:contact@mohstechnologie.com" style="color:#2f74a3;">contact@mohstechnologie.com</a></p>
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
      body: JSON.stringify({ from: "MOHS TECHNOLOGIE <contact@mohstechnologie.com>", to: [email], subject: "Bienvenue chez MOHS TECHNOLOGIE - " + pack, html })
    });
    const data = await res.json();
    if (data.id) { console.log("Mail bienvenue envoye a " + email); return true; }
    console.error("Resend:", JSON.stringify(data)); return false;
  } catch(e) { console.error("Mail:", e.message); return false; }
}

// ── MAIL SOLDE ────────────────────────────────────────────────────────────────
async function envoyerMailSolde({ email, nom, id, pack, montant, solde, lienPaiement }) {
  if (!RESEND_API_KEY) return false;
  const lienHtml = lienPaiement
    ? '<p style="text-align:center;margin:30px 0;"><a href="' + lienPaiement + '" style="background:#2f74a3;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;">Payer le solde (' + Number(solde).toLocaleString("fr-FR") + ' FCFA)</a></p>'
    : '<p style="color:#888;font-size:13px;text-align:center;">Lien de paiement non disponible.</p>';
  const html = `<!DOCTYPE html><html><body style="font-family:Arial;background:#f4f4f4;padding:40px 0;">
  <table width="600" style="margin:auto;background:#fff;border-radius:12px;overflow:hidden;">
    <tr><td style="background:#1a1a2e;padding:30px;text-align:center;">
      <h1 style="color:#2f74a3;margin:0;">MOHS TECHNOLOGIE</h1>
    </td></tr>
    <tr><td style="padding:30px;">
      <h2 style="color:#1a1a2e;">Reglement du solde, ${nom} !</h2>
      <p style="color:#555;">Votre bot est en cours de configuration. Voici le lien pour regler le solde :</p>
      <table width="100%" style="border:1px solid #eee;border-radius:8px;overflow:hidden;margin:20px 0;">
        <tr style="background:#1a1a2e;"><td colspan="2" style="padding:12px 15px;color:#2f74a3;font-weight:bold;">SOLDE A REGLER</td></tr>
        <tr><td style="padding:12px 15px;color:#888;border-bottom:1px solid #eee;width:45%;">ID Client</td>
            <td style="padding:12px 15px;border-bottom:1px solid #eee;"><span style="background:#1a1a2e;color:#2f74a3;padding:4px 12px;border-radius:15px;font-family:monospace;font-weight:bold;">${id}</span></td></tr>
        <tr style="background:#f9f9f9;"><td style="padding:12px 15px;color:#888;border-bottom:1px solid #eee;">Pack</td>
            <td style="padding:12px 15px;font-weight:bold;border-bottom:1px solid #eee;">${pack}</td></tr>
        <tr><td style="padding:12px 15px;color:#888;border-bottom:1px solid #eee;">Montant mensuel</td>
            <td style="padding:12px 15px;border-bottom:1px solid #eee;">${Number(montant).toLocaleString("fr-FR")} FCFA</td></tr>
        <tr style="background:#e8f4fb;"><td style="padding:12px 15px;color:#2f74a3;font-weight:bold;">Solde a payer</td>
            <td style="padding:12px 15px;color:#2f74a3;font-weight:bold;font-size:18px;">${Number(solde).toLocaleString("fr-FR")} FCFA</td></tr>
      </table>
      ${lienHtml}
      <p style="color:#555;font-size:14px;">Contact : <a href="mailto:contact@mohstechnologie.com" style="color:#2f74a3;">contact@mohstechnologie.com</a></p>
    </td></tr>
    <tr><td style="background:#1a1a2e;padding:20px;text-align:center;">
      <p style="color:#2f74a3;margin:0;font-weight:bold;">MOHS TECHNOLOGIE</p>
    </td></tr>
  </table>
</body></html>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": "Bearer " + RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "MOHS TECHNOLOGIE <contact@mohstechnologie.com>", to: [email], subject: "Reglement du solde - MOHS TECHNOLOGIE - " + pack, html })
    });
    const data = await res.json();
    if (data.id) { console.log("Mail solde envoye a " + email); return true; }
    console.error("Resend solde:", JSON.stringify(data)); return false;
  } catch(e) { console.error("Mail solde:", e.message); return false; }
}

// ── MAIL LIVRAISON ────────────────────────────────────────────────────────────
async function envoyerMailLivraison({ email, nom, id, pack, montant, urlBot, urlSheet, date_debut, date_fin }) {
  if (!RESEND_API_KEY) return false;
  const btnBot = urlBot
    ? '<p style="text-align:center;margin:10px 0;"><a href="' + urlBot + '" style="background:#1a1a2e;color:#2f74a3;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;border:2px solid #2f74a3;">Acceder a mon bot</a></p>'
    : '';
  const btnSheet = urlSheet
    ? '<p style="text-align:center;margin:10px 0;"><a href="' + urlSheet + '" style="background:#f0f7ff;color:#2f74a3;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;border:2px solid #2f74a3;">Mon tableau de bord</a></p>'
    : '';
  const html = `<!DOCTYPE html><html><body style="font-family:Arial;background:#f4f4f4;padding:40px 0;">
  <table width="600" style="margin:auto;background:#fff;border-radius:12px;overflow:hidden;">
    <tr><td style="background:#1a1a2e;padding:30px;text-align:center;">
      <h1 style="color:#2f74a3;margin:0;">MOHS TECHNOLOGIE</h1>
      <p style="color:#aaa;margin:5px 0 0;font-size:13px;">Solutions Digitales et Bots Intelligents</p>
    </td></tr>
    <tr><td style="padding:30px;">
      <h2 style="color:#1a1a2e;">Votre bot est pret, ${nom} !</h2>
      <p style="color:#555;">Votre bot a ete configure avec succes. Voici les details de votre abonnement :</p>
      <table width="100%" style="border:1px solid #eee;border-radius:8px;overflow:hidden;margin:20px 0;">
        <tr style="background:#1a1a2e;"><td colspan="2" style="padding:12px 15px;color:#2f74a3;font-weight:bold;">ABONNEMENT ACTIF</td></tr>
        <tr><td style="padding:12px 15px;color:#888;border-bottom:1px solid #eee;width:45%;">ID Client</td>
            <td style="padding:12px 15px;border-bottom:1px solid #eee;"><span style="background:#1a1a2e;color:#2f74a3;padding:4px 12px;border-radius:15px;font-family:monospace;font-weight:bold;">${id}</span></td></tr>
        <tr style="background:#f9f9f9;"><td style="padding:12px 15px;color:#888;border-bottom:1px solid #eee;">Pack</td>
            <td style="padding:12px 15px;font-weight:bold;border-bottom:1px solid #eee;">${pack}</td></tr>
        <tr><td style="padding:12px 15px;color:#888;border-bottom:1px solid #eee;">Montant mensuel</td>
            <td style="padding:12px 15px;font-weight:bold;border-bottom:1px solid #eee;">${Number(montant).toLocaleString("fr-FR")} FCFA</td></tr>
        <tr style="background:#f9f9f9;"><td style="padding:12px 15px;color:#888;border-bottom:1px solid #eee;">Date de debut</td>
            <td style="padding:12px 15px;font-weight:bold;border-bottom:1px solid #eee;">${date_debut}</td></tr>
        <tr><td style="padding:12px 15px;color:#888;">Valide jusqu'au</td>
            <td style="padding:12px 15px;font-weight:bold;color:#2f74a3;">${date_fin}</td></tr>
      </table>
      ${btnBot}
      ${btnSheet}
      <p style="color:#555;font-size:14px;margin-top:20px;">Conservez votre ID <strong style="color:#2f74a3;">${id}</strong> pour tout support.</p>
      <p style="color:#555;font-size:14px;">Contact : <a href="mailto:contact@mohstechnologie.com" style="color:#2f74a3;">contact@mohstechnologie.com</a></p>
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
      body: JSON.stringify({ from: "MOHS TECHNOLOGIE <contact@mohstechnologie.com>", to: [email], subject: "Votre bot est pret ! - MOHS TECHNOLOGIE", html })
    });
    const data = await res.json();
    if (data.id) { console.log("Mail livraison envoye a " + email); return true; }
    console.error("Resend livraison:", JSON.stringify(data)); return false;
  } catch(e) { console.error("Mail livraison:", e.message); return false; }
}

// ── MAIL RENOUVELLEMENT ───────────────────────────────────────────────────────
async function envoyerMailRenouvellement({ email, nom, id, pack, montant, lienPaiement }) {
  if (!RESEND_API_KEY) return false;
  const lienHtml = lienPaiement
    ? '<p style="text-align:center;margin:30px 0;"><a href="' + lienPaiement + '" style="background:#2f74a3;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;">Renouveler mon abonnement (' + Number(montant).toLocaleString("fr-FR") + ' FCFA)</a></p>'
    : '';
  const html = `<!DOCTYPE html><html><body style="font-family:Arial;background:#f4f4f4;padding:40px 0;">
  <table width="600" style="margin:auto;background:#fff;border-radius:12px;overflow:hidden;">
    <tr><td style="background:#1a1a2e;padding:30px;text-align:center;">
      <h1 style="color:#2f74a3;margin:0;">MOHS TECHNOLOGIE</h1>
    </td></tr>
    <tr><td style="padding:30px;">
      <h2 style="color:#1a1a2e;">Renouvellement, ${nom} !</h2>
      <p style="color:#555;">Voici le lien pour renouveler votre abonnement :</p>
      <table width="100%" style="border:1px solid #eee;border-radius:8px;overflow:hidden;margin:20px 0;">
        <tr style="background:#1a1a2e;"><td colspan="2" style="padding:12px 15px;color:#2f74a3;font-weight:bold;">RENOUVELLEMENT</td></tr>
        <tr><td style="padding:12px 15px;color:#888;border-bottom:1px solid #eee;width:45%;">ID Client</td>
            <td style="padding:12px 15px;border-bottom:1px solid #eee;"><span style="background:#1a1a2e;color:#2f74a3;padding:4px 12px;border-radius:15px;font-family:monospace;font-weight:bold;">${id}</span></td></tr>
        <tr style="background:#f9f9f9;"><td style="padding:12px 15px;color:#888;border-bottom:1px solid #eee;">Pack</td>
            <td style="padding:12px 15px;font-weight:bold;border-bottom:1px solid #eee;">${pack}</td></tr>
        <tr style="background:#e8f4fb;"><td style="padding:12px 15px;color:#2f74a3;font-weight:bold;">Montant</td>
            <td style="padding:12px 15px;color:#2f74a3;font-weight:bold;font-size:18px;">${Number(montant).toLocaleString("fr-FR")} FCFA</td></tr>
      </table>
      ${lienHtml}
      <p style="color:#555;font-size:14px;">Contact : <a href="mailto:contact@mohstechnologie.com" style="color:#2f74a3;">contact@mohstechnologie.com</a></p>
    </td></tr>
    <tr><td style="background:#1a1a2e;padding:20px;text-align:center;">
      <p style="color:#2f74a3;margin:0;font-weight:bold;">MOHS TECHNOLOGIE</p>
    </td></tr>
  </table>
</body></html>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": "Bearer " + RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "MOHS TECHNOLOGIE <contact@mohstechnologie.com>", to: [email], subject: "Renouvellement de votre abonnement - MOHS TECHNOLOGIE", html })
    });
    const data = await res.json();
    if (data.id) { console.log("Mail renouvellement envoye a " + email); return true; }
    return false;
  } catch(e) { console.error("Mail renouvellement:", e.message); return false; }
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
      await send(chatId, "Bonjour " + prenom + " ! Je suis ton assistant MOHS TECHNOLOGIE.\n\nTape 'aide' pour voir toutes les commandes.");
      return;
    }

    // PACKS
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
      const rawText  = text.trim().substring(8).trim();
      const allWords = rawText.split(" ");
      const emailWord = allWords.find(w => w.includes("@"));
      if (!emailWord) { await send(chatId, "Email introuvable.\nFormat :\nnouveau Melissa, WEBCOOM, 0196146200 email 1 telegram"); return; }
      const emailIndex = rawText.indexOf(emailWord);
      const avantEmail = rawText.substring(0, emailIndex).trim();
      const apresEmail = rawText.substring(emailIndex + emailWord.length).trim().split(" ").filter(p => p);
      const email      = emailWord;
      const packNum    = apresEmail[0];
      const plateforme = apresEmail[1] || "telegram";
      const nbMois     = parseInt(apresEmail[2]) || 1;
      const segments   = avantEmail.split(",").map(s => s.trim()).filter(s => s);
      let nom, entreprise, telephone;
      if (segments.length >= 3) {
        nom = segments[0]; entreprise = segments[1]; telephone = segments[2];
      } else if (segments.length === 2) {
        nom = segments[0]; entreprise = ""; telephone = segments[1];
      } else {
        const parts = avantEmail.split(" ");
        telephone = parts[parts.length - 1]; nom = parts.slice(0, -1).join(" "); entreprise = "";
      }
      if (!nom || !telephone) { await send(chatId, "Format :\nnouveau Melissa AKPOVI, WEBCOOM SAS, 0196146200 email 1 telegram"); return; }
      const packInfo = PACKS[packNum];
      if (!packInfo) { await send(chatId, "Pack invalide. Tape 'packs'."); return; }

      const idClient     = genererID();
      const montant      = plateforme.toLowerCase() === "whatsapp" ? packInfo.whatsapp : packInfo.telegram;
      const montantTotal = montant * nbMois;
      const acompte      = Math.round(montantTotal / 2);
      const solde        = montantTotal - acompte;

      await send(chatId, "Enregistrement de " + nom + " en cours...");

      const result = await callSheet("add_client", {
        id: idClient, nom, entreprise, telephone, email,
        pack: packInfo.nom,
        plateforme: plateforme.charAt(0).toUpperCase() + plateforme.slice(1),
        montant, nb_mois: nbMois
      });

      if (result.status !== "ok") { await send(chatId, "Erreur : " + result.message); return; }

      let lienPaiement = null;
      if (FEDAPAY_API_KEY) {
        lienPaiement = await genererLienPaiement(idClient, acompte, nom, packInfo.nom, email);
      }

      const mailEnvoye = await envoyerMailBienvenue({
        email, nom, id: idClient, pack: packInfo.nom, montant,
        plateforme: plateforme.charAt(0).toUpperCase() + plateforme.slice(1),
        lienPaiement, acompte, solde
      });

      let msg = "Client enregistre !\n\n";
      msg += "ID : " + idClient + "\n";
      msg += "Nom : " + nom + "\n";
      if (entreprise) msg += "Entreprise : " + entreprise + "\n";
      msg += "Tel : " + telephone + "\n";
      msg += "Email : " + email + "\n";
      msg += "Pack : " + packInfo.nom + "\n";
      msg += "Plateforme : " + plateforme + "\n";
      msg += "Acompte (50%) : " + acompte.toLocaleString("fr-FR") + " FCFA\n";
      msg += "Solde restant : " + solde.toLocaleString("fr-FR") + " FCFA\n\n";
      msg += lienPaiement ? "Lien acompte :\n" + lienPaiement + "\n\n" : "Lien FedaPay non genere\n";
      msg += mailEnvoye ? "Mail envoye a " + email : "Mail non envoye";
      await send(chatId, msg);
      return;
    }

    // TESTER
    if (text.toLowerCase().startsWith("tester ")) {
      const id = text.split(" ")[1]?.trim();
      if (!id) { await send(chatId, "Format : tester [ID]"); return; }
      const result = await callSheet("tester", { id_client: id });
      if (result.status !== "ok") { await send(chatId, "Erreur : " + result.message); return; }
      await send(chatId, "Mode test active !\n\nID : " + id + "\nNom : " + result.nom + "\nStatut : ACTIF (test)\nExpire : " + result.date_fin + "\n\nTape 'solde " + id + "' quand pret a livrer.");
      return;
    }

    // SOLDE - envoie lien paiement + sauvegarde urls
    if (["solde","reste","restant","complement"].some(m => text.toLowerCase().startsWith(m + " "))) {
      const parts    = text.split(" ");
      const id       = parts[1]?.trim();
      const urlBot   = parts.find((p, i) => i > 1 && p.startsWith("https://t.me")) || null;
      const urlSheet = parts.find((p, i) => i > 1 && p.includes("docs.google.com")) || null;
      if (!id) { await send(chatId, "Format : solde [ID] [url bot] [url sheets]\n\nEx: solde MT-X7K2P https://t.me/MonBot https://docs.google.com/..."); return; }

      await send(chatId, "Generation du lien de solde pour " + id + "...");

      const client = await callSheet("get_client", { id });
      if (client.status !== "ok") { await send(chatId, "Client introuvable : " + id); return; }

      const montant = getPrixFromPack(client.pack, client.plateforme);
      const solde   = Math.round(montant / 2);

      // Sauvegarder URLs dans BOTS_A_IMPLEMENTER
      if (urlBot || urlSheet) {
        await callSheet("save_urlbot", { id_client: id, url_bot: urlBot || "", url_sheet: urlSheet || "" });
      }

      let lienPaiement = null;
      if (FEDAPAY_API_KEY) {
        lienPaiement = await genererLienPaiement(id + "-S", solde, client.nom, client.pack, client.email);
      }

      const mailEnvoye = client.email ? await envoyerMailSolde({
        email: client.email, nom: client.nom, id,
        pack: client.pack, montant, solde, lienPaiement
      }) : false;

      let msg = "Lien solde genere !\n\n";
      msg += "ID : " + id + "\n";
      msg += "Nom : " + client.nom + "\n";
      msg += "Solde : " + solde.toLocaleString("fr-FR") + " FCFA\n\n";
      msg += lienPaiement ? "Lien FedaPay :\n" + lienPaiement + "\n\n" : "Lien non genere\n\n";
      msg += mailEnvoye ? "Mail envoye a " + client.email : "Mail non envoye";
      if (urlBot) msg += "\nURL bot sauvegardee";
      if (urlSheet) msg += "\nURL Sheets sauvegardee";
      await send(chatId, msg);
      return;
    }

    // LIVRER - livraison manuelle sans paiement
    if (text.toLowerCase().startsWith("livrer ")) {
      const parts  = text.split(" ");
      const id     = parts[1]?.trim();
      const nbMois = parseInt(parts[2]) || 1;
      if (!id) { await send(chatId, "Format : livrer [ID]\n\nEx: livrer MT-X7K2P"); return; }

      await send(chatId, "Livraison du bot pour " + id + " en cours...");

      const result = await callSheet("livrer", { id_client: id, nb_mois: nbMois });
      console.log("livrer result: " + JSON.stringify(result));
      if (result.status !== "ok") { await send(chatId, "Erreur : " + result.message); return; }

      if (result.email) {
        await envoyerMailLivraison({
          email: result.email, nom: result.nom, id,
          pack: result.pack, montant: getPrixFromPack(result.pack, result.plateforme),
          urlBot: result.url_bot || null,
          urlSheet: result.url_sheet || null,
          date_debut: result.date_debut, date_fin: result.date_fin
        });
      }

      let msg = "Bot livre !\n\n";
      msg += "ID : " + id + "\n";
      msg += "Nom : " + result.nom + "\n";
      msg += "Pack : " + result.pack + "\n";
      msg += "Date debut : " + result.date_debut + "\n";
      msg += "Date fin : " + result.date_fin + "\n\n";
      msg += result.email ? "Mail de livraison envoye a " + result.email : "Pas d email client";
      await send(chatId, msg);
      return;
    }

    // FICHE CLIENT
    if (["client","fiche","voir","chercher","trouver","info"].some(m => text.toLowerCase().startsWith(m + " ")) && !text.toLowerCase().startsWith("clients")) {
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
      msg += "Actions :\ntester " + c.id + "\nsolde " + c.id + "\nlivrer " + c.id + "\nrenouveler " + c.id + "\nsuspendre " + c.id;
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
    if (["renouveler","renouvellement","reabonner","reabonnement","prolonger"].some(m => text.toLowerCase().startsWith(m + " "))) {
      const parts  = text.split(" ");
      const id     = parts[1]?.trim();
      const nbMois = parseInt(parts[2]) || 1;
      if (!id) { await send(chatId, "Format : renouveler [ID] [nb mois]"); return; }

      await send(chatId, "Preparation du renouvellement pour " + id + "...");

      const client = await callSheet("get_client", { id });
      if (client.status !== "ok") { await send(chatId, "Client introuvable : " + id); return; }

      const montantTotal = getPrixFromPack(client.pack, client.plateforme) * nbMois;

      let lienPaiement = null;
      if (FEDAPAY_API_KEY) {
        lienPaiement = await genererLienPaiement(id + "-R", montantTotal, client.nom, client.pack, client.email);
      }

      if (!lienPaiement) { await send(chatId, "Erreur generation lien FedaPay. Reessaie."); return; }

      const result = await callSheet("renouveler", { id_client: id, moyen: "FedaPay", nb_mois: nbMois });
      if (result.status !== "ok") { await send(chatId, "Erreur : " + result.message); return; }

      if (client.email) {
        await envoyerMailRenouvellement({
          email: client.email, nom: client.nom, id,
          pack: client.pack, montant: montantTotal, lienPaiement
        });
      }

      let msg = "Renouvellement prepare !\n\n";
      msg += "Nom : " + client.nom + "\n";
      msg += "ID : " + id + "\n";
      msg += "Duree : " + nbMois + " mois\n";
      msg += "Nouvelle fin : " + result.nouvelle_fin + "\n";
      msg += "Montant : " + montantTotal.toLocaleString("fr-FR") + " FCFA\n\n";
      msg += "Lien FedaPay :\n" + lienPaiement;
      if (client.email) msg += "\n\nMail envoye a " + client.email;
      await send(chatId, msg);
      return;
    }

    // SUSPENDRE
    if (["suspendre","suspension","bloquer","desactiver"].some(m => text.toLowerCase().startsWith(m + " "))) {
      const id = text.split(" ")[1]?.trim();
      const result = await callSheet("suspendre", { id_client: id });
      if (result.status !== "ok") { await send(chatId, "Erreur : " + result.message); return; }
      await send(chatId, "Client suspendu\nNom : " + result.nom + "\nID : " + id + "\n\nTape reactiver " + id + " pour reactiver.");
      return;
    }

    // REACTIVER
    if (["reactiver","reactivation","activer","activation","debloquer"].some(m => text.toLowerCase().startsWith(m + " "))) {
      const id = text.split(" ")[1]?.trim();
      const result = await callSheet("reactiver", { id_client: id });
      if (result.status !== "ok") { await send(chatId, "Erreur : " + result.message); return; }
      await send(chatId, "Client reactive\nNom : " + result.nom + "\nID : " + id);
      return;
    }

    // NOMBOT
    if (text.toLowerCase().startsWith("nombot ")) {
      const parts  = text.split(" ");
      const id     = parts[1]?.trim();
      const nomBot = parts.slice(2).join(" ").trim();
      if (!id || !nomBot) { await send(chatId, "Format : nombot [ID] [nom du bot]"); return; }
      const result = await callSheet("update_nombot", { id_client: id, nom_bot: nomBot });
      if (result.status !== "ok") { await send(chatId, "Erreur : " + result.message); return; }
      await send(chatId, "Nom du bot mis a jour !\n\nID : " + id + "\nNom du bot : " + nomBot);
      return;
    }

    // DESCRIPTION
    if (text.toLowerCase().startsWith("description ")) {
      const parts       = text.split(" ");
      const id          = parts[1]?.trim();
      const description = parts.slice(2).join(" ").trim();
      if (!id || !description) { await send(chatId, "Format : description [ID] [description]"); return; }
      const result = await callSheet("update_description", { id_client: id, description });
      if (result.status !== "ok") { await send(chatId, "Erreur : " + result.message); return; }
      await send(chatId, "Description mise a jour !\n\nID : " + id + "\nDescription : " + description);
      return;
    }

    // BOTS A IMPLEMENTER
    if (text.toLowerCase() === "bots" || text.toLowerCase().startsWith("bots ")) {
      const filtre = text.toLowerCase().replace("bots","").trim() || "tous";
      const filtreMap = { "afaire":"afaire","a faire":"afaire","encours":"encours","en cours":"encours","livre":"livre" };
      const f = filtreMap[filtre] || "tous";
      const result = await callSheet("get_bots", { filtre: f });
      if (result.status !== "ok" || result.total === 0) { await send(chatId, "Aucun bot trouve."); return; }
      let msg = "BOTS A IMPLEMENTER (" + result.total + ")\n\n";
      result.bots.forEach(b => {
        const emoji = b.statut === "LIVRE" ? "OK" : b.statut === "EN COURS" ? "..." : "TODO";
        msg += "[" + emoji + "] " + b.id + " - " + b.nom + "\n";
        msg += "   " + b.pack + " | " + b.plateforme + "\n";
        if (b.nom_bot)     msg += "   Bot : " + b.nom_bot + "\n";
        if (b.entreprise)  msg += "   Entreprise : " + b.entreprise + "\n";
        if (b.description) msg += "   Info : " + b.description + "\n";
        msg += "\n";
      });
      msg += "Commandes :\nbot encours [ID]\nbot fait [ID]";
      await send(chatId, msg);
      return;
    }

    // BOT STATUT
    if (text.toLowerCase().startsWith("bot ")) {
      const parts  = text.split(" ");
      const action = parts[1]?.toLowerCase();
      const id     = parts[2]?.trim();
      if (!id) { await send(chatId, "Format :\nbot encours MT-XXXXX\nbot fait MT-XXXXX"); return; }
      const statutMap = { "fait":"LIVRE","livre":"LIVRE","encours":"EN COURS","afaire":"A FAIRE" };
      const statut = statutMap[action];
      if (!statut) { await send(chatId, "Action invalide. Utiliser : fait, encours, afaire"); return; }
      const result = await callSheet("update_bot_statut", { id_client: id, statut });
      if (result.status !== "ok") { await send(chatId, "Erreur : " + result.message); return; }
      await send(chatId, "Bot mis a jour !\n\nID : " + id + "\nNom : " + result.nom + "\nStatut : " + statut);
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
      let msg = "CA - " + debut + " au " + fin + "\n-------------------\n";
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

    // CONVERSATION NATURELLE
    const intent = detectIntent(text);
    if (intent) { await send(chatId, repondreConversation(intent, prenom)); return; }

    await send(chatId, "Je n'ai pas compris. Tape 'aide' pour voir toutes les commandes.");

  } catch(err) { console.error("Webhook:", err.message); }
});

// ── WEBHOOK FEDAPAY ───────────────────────────────────────────────────────────
app.post("/paiement-confirme", async (req, res) => {
  res.sendStatus(200);
  try {
    const event = req.body;
    console.log("Webhook event name: " + event.name);
    if (event.name !== "transaction.approved") return;
    const transaction = event.entity;
    const ref = transaction.merchant_reference || "";
    console.log("Webhook FedaPay ref: " + ref);
    if (!ref.startsWith("MOHSBOT_")) { console.log("Ref ignoree: " + ref); return; }

    const segments = ref.split("_");
    const idClient = segments[1];
    const typePaie = ref.includes("-S") ? "SOLDE" : ref.includes("-R") ? "RENOUVELLEMENT" : "ACOMPTE";
    console.log("Webhook idClient: " + idClient + " type: " + typePaie);

    const result = await callSheet("update_abonnement", { id_client: idClient, ref_paiement: transaction.id, moyen: "FedaPay" });

    if (result.status === "ok") {
      await send(ADMIN_CHAT_ID, "Paiement recu ! (" + typePaie + ")\n\nNom : " + result.nom + "\nID : " + idClient + "\nMontant : " + Number(result.montant).toLocaleString("fr-FR") + " FCFA\nValide jusqu'au : " + result.nouvelle_fin);

      // Si c'est le SOLDE → livraison automatique
      if (typePaie === "SOLDE") {
        console.log("Solde paye - livraison automatique pour " + idClient);
        const livraison = await callSheet("livrer", { id_client: idClient, nb_mois: 1 });
        if (livraison.status === "ok" && livraison.email) {
          await envoyerMailLivraison({
            email: livraison.email, nom: livraison.nom, id: idClient,
            pack: livraison.pack, montant: getPrixFromPack(livraison.pack, livraison.plateforme),
            urlBot: livraison.url_bot || null,
            urlSheet: livraison.url_sheet || null,
            date_debut: livraison.date_debut, date_fin: livraison.date_fin
          });
          await send(ADMIN_CHAT_ID, "Bot livre automatiquement !\n\nNom : " + livraison.nom + "\nID : " + idClient + "\nDate debut : " + livraison.date_debut + "\nDate fin : " + livraison.date_fin);
        }
      }
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