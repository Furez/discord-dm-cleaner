#!/usr/bin/env node
// Supprime un par un les messages de l'auteur indiqué dans un DM Discord.
// Par défaut : simulation. Ajoutez --delete pour supprimer réellement.
//
// Exemple :
//   node src/delete-my-messages.mjs -c 123456789012345678 -a "MonPseudo"
//   node src/delete-my-messages.mjs -c 123456789012345678 -a "MonPseudo" --delete

import { parseArgs } from "node:util";
import { CDP } from "./cdp.mjs";

const UI = {
  fr: {
    deleteItem: "Supprimer le message",
    confirm: "Supprimer",
  },
  en: {
    deleteItem: "Delete Message",
    confirm: "Delete",
  },
};

const { values: opts } = parseArgs({
  options: {
    channel: { type: "string", short: "c" },
    author: { type: "string", short: "a" },
    delete: { type: "boolean", default: false },
    lang: { type: "string", default: "fr" },
    port: { type: "string", default: "9222" },
    delay: { type: "string", default: "1500" },
    max: { type: "string", default: "100000" },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (opts.help) {
  console.log(`Discord DM Cleaner — supprime vos propres messages dans un DM.

Usage :
  node src/delete-my-messages.mjs --channel <id> --author <pseudo> [options]

Options :
  -c, --channel <id>    Identifiant du salon DM (obligatoire)
  -a, --author <nom>    Pseudo exact affiché sur vos messages (obligatoire)
      --delete          Suppression réelle (sinon simulation)
      --lang <fr|en>    Langue de l'interface Discord (défaut : fr)
      --port <n>        Port de débogage CDP (défaut : 9222)
      --delay <ms>      Délai de base entre suppressions (défaut : 1500)
      --max <n>         Nombre maximum d'actions (défaut : 100000)
  -h, --help            Affiche cette aide`);
  process.exit(0);
}

const channelId = opts.channel;
const author = (opts.author || "").trim();
const lang = opts.lang === "en" ? "en" : "fr";
const ui = UI[lang];
const port = Number(opts.port);
const baseDelay = Math.max(500, Number(opts.delay) || 1500);
const maxActions = Math.max(1, Number(opts.max) || 100000);
const realDelete = Boolean(opts.delete);

if (!channelId || !/^\d{17,20}$/.test(channelId)) {
  console.error("Identifiant de salon invalide. Utilisez --channel <id>.");
  process.exit(1);
}
if (!author) {
  console.error("Pseudo de l'auteur manquant. Utilisez --author <pseudo>.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (msg) => console.log(`${new Date().toISOString()} ${msg}`);

let cdp;
process.on("SIGINT", () => {
  log("Interruption demandée, arrêt.");
  try {
    cdp?.close();
  } catch {}
  process.exit(130);
});

cdp = await CDP.connect({ port });

const href = await cdp.eval("location.href");
if (!href.includes(`/channels/@me/${channelId}`)) {
  console.error(
    `Mauvais salon : ${href}\nOuvrez d'abord le DM ${channelId} dans Vesktop.`,
  );
  process.exit(1);
}

log(
  `=== Salon ${channelId} — auteur « ${author} » — mode ${realDelete ? "SUPPRESSION" : "simulation"}`,
);

// Se placer en bas de l'historique.
await cdp.eval(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 25; i++) {
    const list = document.querySelector('[data-list-id="chat-messages"]');
    let el = list;
    while (el && !(el.scrollHeight > el.clientHeight + 20)) el = el.parentElement;
    if (!el) return false;
    el.scrollTop = el.scrollHeight;
    await sleep(300);
  }
  return true;
})()`);
await sleep(700);
log("Positionné en bas de l'historique.");

const MESSAGES_FN = `(() => {
  const list = document.querySelector('[data-list-id="chat-messages"]');
  if (!list) return null;
  const items = [...list.querySelectorAll('li[id^="chat-messages-"]')];
  let currentAuthor = null;
  const out = [];
  for (const el of items) {
    const header = el.querySelector('h3 span[class*="username"]');
    if (header) currentAuthor = (header.textContent || "").trim();
    const r = el.getBoundingClientRect();
    out.push({
      id: el.id,
      mid: el.id.split("-").pop(),
      author: currentAuthor,
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      x: Math.round(r.left + Math.min(140, Math.max(60, r.width / 2))),
      y: Math.round(r.top + r.height / 2),
    });
  }
  return out;
})()`;

const SCROLL_FN = `(() => {
  const list = document.querySelector('[data-list-id="chat-messages"]');
  if (!list) return null;
  let el = list;
  while (el && !(el.scrollHeight > el.clientHeight + 20)) el = el.parentElement;
  const r = list.getBoundingClientRect();
  return {
    top: el ? Math.round(el.scrollTop) : -1,
    x: Math.round(r.left + r.width / 2),
    y: Math.round(r.top + r.height / 2),
  };
})()`;

async function findDeleteItem() {
  return cdp.eval(`(() => {
    const items = [...document.querySelectorAll('[role="menu"] [role="menuitem"]')];
    const it = items.find((i) => (i.innerText || "").trim() === ${JSON.stringify(ui.deleteItem)});
    if (!it) return null;
    const r = it.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  })()`);
}

async function openDialog() {
  for (let i = 0; i < 20; i++) {
    const dialog = await cdp.eval(`(() => {
      const d = [...document.querySelectorAll('[role="dialog"]')].find(
        (d) => (d.innerText || "").includes(${JSON.stringify(ui.deleteItem)}),
      );
      if (!d) return null;
      const b = [...d.querySelectorAll("button")].find(
        (b) => (b.innerText || "").trim() === ${JSON.stringify(ui.confirm)},
      );
      const text = (d.innerText || "").replace(/\\s+/g, " ");
      if (!b) return { text: text.slice(0, 500), button: null };
      const r = b.getBoundingClientRect();
      return {
        text: text.slice(0, 500),
        button: { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) },
      };
    })()`);
    if (dialog?.button) return dialog;
    await sleep(150);
  }
  return null;
}

async function handleMessage(msg) {
  const elSel = JSON.stringify(msg.id);
  await cdp.escape();
  await sleep(120);

  const visible = await cdp.eval(
    `(() => { const el = document.getElementById(${elSel}); if (!el) return false; el.scrollIntoView({ block: "center" }); return true; })()`,
  );
  if (!visible) return { status: "gone" };
  await sleep(300);

  const content = await cdp.eval(
    `(() => {
      const c = document.getElementById(${JSON.stringify("message-content-" + msg.mid)});
      return c ? (c.innerText || "").replace(/\\s+/g, " ").trim() : "";
    })()`,
  );

  for (let attempt = 0; attempt < 2; attempt++) {
    const rect = await cdp.eval(
      `(() => {
        const el = document.getElementById(${elSel});
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          x: Math.round(r.left + Math.min(140, Math.max(60, r.width / 2))),
          y: Math.round(r.top + r.height / 2),
        };
      })()`,
    );
    if (!rect) return { status: "gone" };

    await cdp.click(rect.x, rect.y, "right");
    await sleep(500);
    const item = await findDeleteItem();
    if (!item) {
      await cdp.escape();
      await sleep(300);
      continue;
    }

    if (!realDelete) {
      await cdp.escape();
      await sleep(200);
      return { status: "would-delete" };
    }

    await cdp.click(item.x, item.y);
    await sleep(450);

    const dialog = await openDialog();
    if (!dialog) {
      await cdp.escape();
      await sleep(250);
      return { status: "no-dialog" };
    }
    if (!dialog.text.includes(author)) {
      await cdp.escape();
      await sleep(250);
      return { status: "author-mismatch" };
    }
    if (
      content.length >= 8 &&
      !dialog.text.includes(content.slice(0, 15))
    ) {
      await cdp.escape();
      await sleep(250);
      return { status: "content-mismatch" };
    }

    await cdp.click(dialog.button.x, dialog.button.y);
    await sleep(800);

    let gone = false;
    for (let i = 0; i < 25; i++) {
      gone = await cdp.eval(
        `!document.getElementById(${elSel}) && !document.getElementById(${JSON.stringify("message-content-" + msg.mid)})`,
      );
      if (gone) break;
      await sleep(200);
    }
    return { status: gone ? "deleted" : "not-gone" };
  }

  return { status: "not-mine" };
}

const processed = new Set();
let deleted = 0;
let wouldDelete = 0;
let ignored = 0;
let failures = 0;
let actions = 0;
let atTop = 0;

while (actions < maxActions) {
  const messages = (await cdp.eval(MESSAGES_FN)) || [];
  const candidates = messages.filter(
    (m) =>
      !processed.has(m.id) &&
      (m.author === author || m.author === null),
  );

  if (candidates.length === 0) {
    const before = await cdp.eval(SCROLL_FN);
    if (!before) break;
    await cdp.wheel(before.x, before.y, -640);
    await sleep(1300);
    const after = await cdp.eval(SCROLL_FN);
    const fresh = ((await cdp.eval(MESSAGES_FN)) || []).some(
      (m) =>
        !processed.has(m.id) &&
        (m.author === author || m.author === null),
    );
    const moved = after && before.top !== undefined && after.top < before.top - 2;
    if (!fresh && !moved && after && after.top <= 2) {
      atTop++;
      if (atTop >= 3) {
        log("Haut de l'historique atteint.");
        break;
      }
    } else {
      atTop = 0;
    }
    continue;
  }

  const target = candidates[candidates.length - 1];
  const result = await handleMessage(target);
  actions++;

  if (result.status === "deleted") {
    deleted++;
    processed.add(target.id);
    log(`SUPPRIMÉ ${target.mid} (${deleted} au total)`);
    if (deleted % 10 === 0) await sleep(3000);
    else await sleep(baseDelay + Math.random() * 700);
  } else if (result.status === "would-delete") {
    wouldDelete++;
    processed.add(target.id);
    log(`À SUPPRIMER ${target.mid} — ${target.author ?? "auteur déduit"}`);
    await sleep(300);
  } else if (result.status === "not-mine") {
    ignored++;
    processed.add(target.id);
    await sleep(200);
  } else if (result.status === "gone") {
    processed.add(target.id);
  } else {
    failures++;
    processed.add(target.id);
    log(`ÉCHEC ${result.status} ${target.mid}`);
    if (failures >= 3) {
      log("3 échecs : arrêt de sécurité.");
      break;
    }
  }
}

log(
  `=== FIN : supprimés=${deleted} à-supprimer=${wouldDelete} ignorés=${ignored} échecs=${failures}`,
);
cdp.close();
