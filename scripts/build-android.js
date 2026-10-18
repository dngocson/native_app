#!/usr/bin/env node

/**
 * Đóng gói firmware rồi build APK release.
 *
 * Chạy: npm run build:android
 * APK: android/app/build/outputs/apk/release/app-release.apk
 */

const { execSync } = require("child_process");
const path = require("path");

const root = process.cwd();
const androidDir = path.join(root, "android");
const gradlew = `"${path.join(androidDir, process.platform === "win32" ? "gradlew.bat" : "gradlew")}"`;

const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: "inherit" });

try {
  run("node scripts/build-firmware.js", root);
  run(`${gradlew} assembleRelease`, androidDir);
  console.log(
    "\nAPK: " +
      path.join(androidDir, "app", "build", "outputs", "apk", "release", "app-release.apk"),
  );
} catch {
  process.exit(1);
}
