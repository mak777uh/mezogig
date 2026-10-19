// Captures submission screenshots from the built frontend using the locally installed
// Chrome via playwright-core (no browser download).
//
//   1) serve the build:  cd frontend/dist && python -m http.server 4180
//   2) node scripts/screenshots.js
//
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const BASE = process.env.SCREEN_BASE || "http://127.0.0.1:4180";
const OUT = path.join(__dirname, "..", "docs", "screens");

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1360, height: 940 } });

  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console.error: ${m.text().slice(0, 200)}`);
  });

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, "01-my-gigs.png"), fullPage: true });
  console.log("01-my-gigs.png");

  // Create-gig tab, filled with a realistic example.
  await page.getByRole("button", { name: "Create gig" }).click();
  await page.waitForTimeout(500);
  const addrInputs = page.locator('input[placeholder="0x…"]');
  if ((await addrInputs.count()) >= 1) {
    await addrInputs.nth(0).fill("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
  }
  if ((await addrInputs.count()) >= 2) {
    await addrInputs.nth(1).fill("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC");
  }
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, "02-create-gig.png"), fullPage: true });
  console.log("02-create-gig.png");

  // Wallet modal (RainbowKit) — shows that the app is wired to the chain selector.
  try {
    const connectBtn = page.locator('[data-testid="rk-connect-button"], button:has-text("Connect Wallet")').first();
    await connectBtn.click({ timeout: 6000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, "03-connect-wallet.png"), fullPage: false });
    console.log("03-connect-wallet.png");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  } catch (e) {
    console.log("wallet modal screenshot skipped:", e.message.slice(0, 120));
  }

  // Help tab — the judge path.
  await page.getByRole("button", { name: "How to test in 5 min" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, "04-help.png"), fullPage: true });
  console.log("04-help.png");

  console.log(`\nconsole/page errors: ${errors.length}`);
  for (const e of errors.slice(0, 10)) console.log("  " + e);

  await browser.close();
  const files = fs.readdirSync(OUT).filter((f) => f.endsWith(".png"));
  console.log("\nscreenshots: " + files.join(", "));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
