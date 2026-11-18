import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Keep the SDK and the credential-owning server in the speech installation.
export async function callSpeechTool(name, args = {}) {
  const client = new Client({ name: "frameboard", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("./doubao-speech.mjs", import.meta.url))],
    stderr: "ignore",
  });
  try {
    await client.connect(transport);
    const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 240_000 });
    const value = JSON.parse(result.content[0].text);
    if (result.isError) throw Object.assign(Error(value.error), { code: value.code });
    return value;
  } finally {
    await client.close();
  }
}
