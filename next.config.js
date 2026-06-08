/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    domains: ['enlarging-class-unmasking.ngrok-free.dev', 'tryhackswigger.ddns.net', 'localhost'],
  },
  webpack: (config) => {
    config.externals = [...(config.externals || []), 'cpu-features', 'sshcrypto'];
    return config;
  },
}

module.exports = nextConfig
