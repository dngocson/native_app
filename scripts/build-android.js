#!/usr/bin/env node

/**
 * Đóng gói firmware rồi build APK release.
 *
 * Chạy: npm run build:android
 * APK được copy ra dist/app-release.apk cho dễ lấy.
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const androidDir = path.join(root, "android");
const gradlew = `"${path.join(androidDir, process.platform === "win32" ? "gradlew.bat" : "gradlew")}"`;

const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: "inherit" });

try {
  run("node scripts/build-firmware.js", root);
  run(`${gradlew} assembleRelease`, androidDir);

  const apk = path.join(androidDir, "app", "build", "outputs", "apk", "release", "app-release.apk");
  const distDir = path.join(root, "dist");
  const distApk = path.join(distDir, "app-release.apk");
  fs.mkdirSync(distDir, { recursive: true });
  fs.copyFileSync(apk, distApk);
  console.log(`\nAPK: ${distApk}`);
} catch {
  process.exit(1);
}
