const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const projectRoot = __dirname;

const config = getDefaultConfig(projectRoot);

// Fix path Windows (tránh lỗi "Received protocol 'd:'")
config.resolver.assetExts = config.resolver.assetExts || [];
config.resolver.sourceExts = config.resolver.sourceExts || [];

module.exports = withNativeWind(config, {
  input: path.resolve(projectRoot, "global.css"),
});
