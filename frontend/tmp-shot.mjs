import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const chrome = spawn(
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--remote-debugging-port=9223",
    "--window-size=1280,800",
    "about:blank",
  ],
  { stdio: "ignore" },
);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let id = 0;
let ws;

function send(method, params = {}, sessionId) {
  const msgId = ++id;
  return new Promise((resolve, reject) => {
    const onMessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id !== msgId) return;
      ws.removeEventListener("message", onMessage);
      if (data.error) reject(new Error(JSON.stringify(data.error)));
      else resolve(data.result);
    };
    ws.addEventListener("message", onMessage);
    ws.send(JSON.stringify({ id: msgId, method, params, sessionId }));
  });
}

async function main() {
  let version;
  for (let i = 0; i < 40; i++) {
    try {
      version = await (await fetch("http://127.0.0.1:9223/json/version")).json();
      break;
    } catch {
      await sleep(150);
    }
  }
  if (!version) throw new Error("chrome did not start");
  ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
  });

  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, sessionId);
  await send("Runtime.enable", {}, sessionId);
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  }, sessionId);

  async function shot(name) {
    const { data } = await send("Page.captureScreenshot", { format: "png" }, sessionId);
    const path = `C:\\Users\\colde\\Documents\\fsp_spec_track\\frontend\\${name}.png`;
    writeFileSync(path, Buffer.from(data, "base64"));
    return path;
  }

  async function evalJs(expression) {
    const result = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    }, sessionId);
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }

  function waitLoad() {
    return new Promise((resolve) => {
      const onMessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.method === "Page.loadEventFired" && data.sessionId === sessionId) {
          ws.removeEventListener("message", onMessage);
          resolve();
        }
      };
      ws.addEventListener("message", onMessage);
    });
  }

  await send("Page.navigate", { url: "http://127.0.0.1:5173/login" }, sessionId);
  for (let i = 0; i < 30; i++) {
    const found = await evalJs(`Boolean(document.querySelector(".auth-card"))`);
    if (found) break;
    await sleep(200);
  }
  const login = await evalJs(`(() => {
    const card = document.querySelector(".auth-card");
    const header = document.querySelector(".topbar");
    const box = card ? card.getBoundingClientRect() : null;
    return {
      href: location.href,
      ready: document.readyState,
      html: document.body ? document.body.innerText.slice(0, 180) : "",
      cardTop: box?.top,
      cardHeight: box?.height,
      cardCenter: box ? box.top + box.height / 2 : null,
      screenCenter: window.innerHeight / 2,
      header: header ? header.getBoundingClientRect().height : null,
      innerHeight: window.innerHeight,
    };
  })()`);
  await shot("tmp-login");
  console.log("LOGIN", JSON.stringify(login));

  const tokens = await (await fetch("http://127.0.0.1:8000/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "marina@example.com", password: "demo1234" }),
  })).json();

  await evalJs(`localStorage.setItem("access", ${JSON.stringify(tokens.access_token)}); localStorage.setItem("refresh", ${JSON.stringify(tokens.refresh_token)}); "ok"`);
  const shortlistLoaded = waitLoad();
  await send("Page.navigate", { url: "http://127.0.0.1:5173/e/v/4" }, sessionId);
  await shortlistLoaded;
  await sleep(500);
  const before = await evalJs(`document.body.innerText.slice(0, 200)`);
  console.log("PAGE", before);
  await evalJs(`document.querySelector(".btn-red")?.click(); "clicked"`);
  await sleep(600);
  const mark = await evalJs(`(() => {
    const person = document.querySelector(".person");
    const status = document.querySelector(".person-mark");
    if (!person || !status) return { text: document.body.innerText.slice(0, 400) };
    const p = person.getBoundingClientRect();
    const s = status.getBoundingClientRect();
    return {
      personTop: p.top,
      personHeight: p.height,
      personCenter: p.top + p.height / 2,
      statusTop: s.top,
      statusHeight: s.height,
      statusCenter: s.top + s.height / 2,
      delta: (s.top + s.height / 2) - (p.top + p.height / 2),
    };
  })()`);
  await shot("tmp-person");
  console.log("MARK", JSON.stringify(mark));
  ws.close();
  chrome.kill();
}

main().catch((err) => {
  console.error(err);
  chrome.kill();
  process.exit(1);
});
