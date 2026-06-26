/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@newsdata/shared"],
  webpack(config) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"]
    };

    return config;
  }
};

export default nextConfig;
