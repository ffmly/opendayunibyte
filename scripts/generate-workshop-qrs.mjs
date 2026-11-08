import fs from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import QRCode from "qrcode";

nextEnv.loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;

if (!url || !secret) {
  throw new Error("Missing Supabase credentials in environment");
}

const supabase = createClient(url, secret);

// Production web app origin verified live at https://opendayunibyte.vercel.app
const PRODUCTION_ORIGIN = "https://opendayunibyte.vercel.app";

const DESKTOP_DIR = path.join("C:", "Users", "itsbe", "Desktop", "Workshops_QR_Codes");

async function run() {
  console.log("Fetching workshops and active QR codes from Supabase...");
  
  const { data: workshops, error: wsErr } = await supabase
    .from("workshops")
    .select("id, code, title, location, xp")
    .order("code");

  if (wsErr || !workshops) {
    throw new Error("Failed to fetch workshops: " + wsErr?.message);
  }

  const { data: qrs, error: qrErr } = await supabase
    .from("qr_codes")
    .select("token, target_id, type, active")
    .eq("type", "WORKSHOP");

  if (qrErr || !qrs) {
    throw new Error("Failed to fetch QR codes: " + qrErr?.message);
  }

  console.log(`Found ${workshops.length} workshops and ${qrs.length} workshop QR codes.`);

  // Create desktop directories
  if (!fs.existsSync(DESKTOP_DIR)) {
    fs.mkdirSync(DESKTOP_DIR, { recursive: true });
  }

  const numberedDir = path.join(DESKTOP_DIR, "Numbered (WS-01 to WS-10)");
  if (!fs.existsSync(numberedDir)) {
    fs.mkdirSync(numberedDir, { recursive: true });
  }

  const purpleDir = path.join(DESKTOP_DIR, "UniByte Brand Purple");
  if (!fs.existsSync(purpleDir)) {
    fs.mkdirSync(purpleDir, { recursive: true });
  }

  const tokenOnlyDir = path.join(DESKTOP_DIR, "Raw Tokens Only (No URL)");
  if (!fs.existsSync(tokenOnlyDir)) {
    fs.mkdirSync(tokenOnlyDir, { recursive: true });
  }

  const manifest = [];

  for (const w of workshops) {
    const qrRow = qrs.find((q) => q.target_id === w.id);
    if (!qrRow) {
      console.error(`WARNING: No QR code found for workshop ${w.code} (${w.title})`);
      continue;
    }

    const token = qrRow.token;
    const scanUrl = `${PRODUCTION_ORIGIN}/scan?token=${encodeURIComponent(token)}`;

    // Sanitize title for filename just in case
    const safeTitle = w.title.replace(/[<>:"/\\|?*]/g, "_").trim();

    // 1. Primary QR code in main folder named exactly by workshop name
    // e.g., "ركن النشاطات الجامعية.png", "UniByte Academy.png"
    const mainFile = path.join(DESKTOP_DIR, `${safeTitle}.png`);
    await QRCode.toFile(mainFile, scanUrl, {
      type: "png",
      width: 1024,
      margin: 3,
      errorCorrectionLevel: "H",
      color: { dark: "#000000", light: "#FFFFFF" },
    });

    // 2. Numbered version in subfolder for clean sorted viewing
    // e.g., "WS-01 - ركن النشاطات الجامعية.png"
    const numberedFile = path.join(numberedDir, `${w.code} - ${safeTitle}.png`);
    await QRCode.toFile(numberedFile, scanUrl, {
      type: "png",
      width: 1024,
      margin: 3,
      errorCorrectionLevel: "H",
      color: { dark: "#000000", light: "#FFFFFF" },
    });

    // 3. UniByte Brand Purple version in subfolder
    const purpleFile = path.join(purpleDir, `${safeTitle} (Purple).png`);
    await QRCode.toFile(purpleFile, scanUrl, {
      type: "png",
      width: 1024,
      margin: 3,
      errorCorrectionLevel: "H",
      color: { dark: "#550055", light: "#FFFFFF" },
    });

    // 4. Raw token-only QR in subfolder
    const tokenFile = path.join(tokenOnlyDir, `${safeTitle} (Token).png`);
    await QRCode.toFile(tokenFile, token, {
      type: "png",
      width: 1024,
      margin: 3,
      errorCorrectionLevel: "H",
      color: { dark: "#000000", light: "#FFFFFF" },
    });

    manifest.push({
      code: w.code,
      title: w.title,
      location: w.location,
      token,
      url: scanUrl,
      fileName: `${safeTitle}.png`,
    });

    console.log(`✓ Generated QR for [${w.code}] ${w.title} -> ${mainFile}`);
  }

  // Create a clean README.txt in the folder for quick reference
  const readmeContent = [
    "============================================================",
    "  UniByte Open Day - Workshop QR Codes (رموز استجابة سريعة للورشات)",
    "============================================================",
    "",
    "Production App URL: " + PRODUCTION_ORIGIN,
    "Generated at: " + new Date().toLocaleString(),
    "",
    "HOW TO USE:",
    "1. These high-resolution (1024x1024) PNGs can be printed directly,",
    "   placed on tables, or added to event posters and banners.",
    "2. When participants scan with their phone camera (iPhone / Samsung / Android),",
    "   it immediately opens the UniByte Open Day app and records their attendance.",
    "3. It also works seamlessly inside the app scanner (/scan tab).",
    "",
    "FOLDER STRUCTURE:",
    "- Main folder: High-contrast black PNGs named exactly after each workshop.",
    "- 'Numbered (WS-01 to WS-10)': Sorted numerically by workshop code.",
    "- 'UniByte Brand Purple': High-res PNGs in UniByte's signature purple (#550055).",
    "- 'Raw Tokens Only (No URL)': Encodes just the token string if ever needed.",
    "",
    "LIST OF WORKSHOPS & TOKENS:",
    "------------------------------------------------------------",
    ...manifest.map(
      (m, i) =>
        `${i + 1}. [${m.code}] ${m.title}\n   Location: ${m.location}\n   Token: ${m.token}\n   URL: ${m.url}\n   File: ${m.fileName}\n`,
    ),
    "============================================================",
  ].join("\n");

  fs.writeFileSync(path.join(DESKTOP_DIR, "README_QR_INFO.txt"), readmeContent, "utf8");
  console.log("\nCreated README_QR_INFO.txt with full workshop and token mapping.");
  console.log(`\nAll QR codes successfully saved to:\n${DESKTOP_DIR}`);
}

run().catch((err) => {
  console.error("Execution failed:", err);
  process.exit(1);
});
