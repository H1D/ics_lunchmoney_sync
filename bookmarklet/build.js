#!/usr/bin/env bun
import { build } from "esbuild";
import { writeFile, watch } from "fs/promises";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(__dirname, "src/bookmarklet.js");
const OUTPUT = resolve(__dirname, "../bookmarklet.js"); // Output to repo root

async function buildBookmarklet() {
  try {
    console.log("🔨 Building bookmarklet...");

    // Build and minify with esbuild
    const result = await build({
      entryPoints: [SOURCE],
      bundle: false,
      minify: true,
      target: "es2022",
      format: "iife",
      write: false,
      charset: "utf8",
    });

    // Get the minified code
    let code = new TextDecoder().decode(result.outputFiles[0].contents);

    // Wrap in javascript: protocol - single line for easy copying
    const bookmarklet = `javascript: ${code}`;

    // Write to output file
    await writeFile(OUTPUT, bookmarklet, "utf8");

    console.log(`✅ Built successfully: ${OUTPUT}`);
    console.log(`   Size: ${bookmarklet.length} characters`);
  } catch (err) {
    console.error("❌ Build failed:", err);
    throw err;
  }
}

// Check if watch mode
const isWatch = process.argv.includes("--watch") || process.argv.includes("-w");

if (isWatch) {
  console.log("👀 Watching for changes...\n");

  // Initial build
  await buildBookmarklet();

  // Watch for changes
  const watcher = watch(SOURCE);
  for await (const event of watcher) {
    if (event.eventType === "change") {
      console.log("\n📝 File changed, rebuilding...");
      await buildBookmarklet();
    }
  }
} else {
  // Single build
  await buildBookmarklet();
}
