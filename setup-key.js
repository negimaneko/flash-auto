import readline from "node:readline";
import { execSync } from "node:child_process";
import https from "node:https";
import { Buffer } from "node:buffer";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const envTargets = ["development", "preview", "production"];

console.log("");
console.log("=== Groq API key setup ===");
console.log("");
console.log("Groq の API キーを入力して Enter を押してください。");
console.log("gsk_ で始まるキーを想定しています。\n");

rl.question("API key > ", (key) => {
  const trimmed = key.trim();
  if (!trimmed.startsWith("gsk_")) {
    console.log("\n  Error: API key must start with gsk_");
    rl.close();
    process.exit(1);
  }

  console.log("\n  Checking API key...");

  const body = JSON.stringify({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: "Say hi" }],
    max_tokens: 10,
  });

  const req = https.request(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + trimmed,
        "Content-Length": Buffer.byteLength(body),
      },
    },
    (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            console.log("\n  Invalid API key: " + json.error.message);
            rl.close();
            process.exit(1);
          }

          console.log("  API key is valid.");
          console.log("  Updating Vercel environment variables...");

          for (const target of envTargets) {
            try {
              execSync(`vercel.cmd env rm GROQ_API_KEY ${target} -y`, { stdio: "pipe" });
            } catch {}
            execSync(`vercel.cmd env add GROQ_API_KEY ${target}`, {
              input: trimmed,
              stdio: ["pipe", "pipe", "pipe"],
            });
          }

          console.log("  Vercel env updated for development, preview, and production.");
          console.log("  Deploying production build...\n");
          execSync("vercel.cmd --yes --prod", { stdio: "inherit" });
          console.log("\n  Deployment finished.");
        } catch (error) {
          console.log("\n  Error: " + error.message);
        }
        rl.close();
      });
    }
  );

  req.on("error", (error) => {
    console.log("\n  Network error: " + error.message);
    rl.close();
  });

  req.write(body);
  req.end();
});
