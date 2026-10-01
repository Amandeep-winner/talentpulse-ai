/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@talentpulse/shared'],
  reactStrictMode: true,
};

module.exports = nextConfig;
