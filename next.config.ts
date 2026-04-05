import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  webpack: (config) => {
    // Fix Supabase ESM wrapper: '../module/index.js' has no default export
    // but wrapper.mjs imports it as `import * as index` which Webpack
    // misinterprets. Force CJS resolution for this package.
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...config.resolve.alias,
      "@supabase/supabase-js": require.resolve("@supabase/supabase-js"),
    };
    return config;
  },
};

export default withNextIntl(nextConfig);
