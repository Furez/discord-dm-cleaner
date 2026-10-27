// Petit client Chrome DevTools Protocol (CDP) pour piloter la page Discord.
// Aucune dépendance : utilise le WebSocket natif de Node.js 22+.

export class CDP {
  #ws;
  #nextId = 1;
  #pending = new Map();

  static async connect({ port = 9222, urlIncludes = "discord.com/channels" } = {}) {
    let targets;
    try {
      targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
    } catch {
      throw new Error(
        `Impossible de joindre le port ${port}. ` +
          `Lancez Vesktop avec --remote-debugging-port=${port}.`,
      );
    }
    const page = targets.find((t) => t.type === "page" && t.url.includes(urlIncludes));
    if (!page) {
      throw new Error("Page Discord introuvable dans les cibles CDP.");
    }
    const cdp = new CDP(page.webSocketDebuggerUrl);
    await cdp.#open();
    return cdp;
  }

  constructor(url) {
    this.#ws = new WebSocket(url);
    this.#ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.#pending.has(msg.id)) {
        this.#pending.get(msg.id)(msg);
        this.#pending.delete(msg.id);
      }
    });
  }

  #open() {
    return new Promise((resolve, reject) => {
      this.#ws.addEventListener("open", resolve, { once: true });
      this.#ws.addEventListener("error", reject, { once: true });
    });
  }

  send(method, params = {}) {
    const id = this.#nextId++;
    this.#ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve) => this.#pending.set(id, resolve));
  }

  async eval(expression) {
    const res = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
      timeout: 30000,
    });
    if (res.result?.exceptionDetails) {
      const detail =
        res.result.exceptionDetails.exception?.description ||
        res.result.exceptionDetails.text;
      throw new Error(`Erreur JavaScript : ${detail}`);
    }
    return res.result?.result?.value;
  }

  async click(x, y, button = "left") {
    await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await this.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button,
      buttons: button === "left" ? 1 : 2,
      clickCount: 1,
    });
    await this.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button,
      buttons: 0,
      clickCount: 1,
    });
  }

  async escape() {
    await this.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
    });
    await this.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
    });
  }

  wheel(x, y, deltaY) {
    return this.send("Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x,
      y,
      deltaX: 0,
      deltaY,
    });
  }

  close() {
    this.#ws.close();
  }
}
