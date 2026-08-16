// Expo Metro config wrapped with Sentry's serializer so release bundles carry a
// debug id — this is what lets Sentry match uploaded source maps to crashes and
// symbolicate stack traces. Extend `config` here if you add SVG transformers etc.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);

module.exports = config;
