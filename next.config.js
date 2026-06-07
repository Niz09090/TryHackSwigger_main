/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    domains: ['lenses-reporting-somewhere-thought.trycloudflare.com', 'tryhackswigger.ddns.net', 'localhost'],
  },
  webpack: (config) => {
    config.externals = [...(config.externals || []), 'cpu-features', 'sshcrypto'];
    return config;
  },
}

module.exports = nextConfig
