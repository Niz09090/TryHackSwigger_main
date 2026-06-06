/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['localhost'],
  },
  webpack: (config) => {
    config.externals = [...(config.externals || []), 'cpu-features', 'sshcrypto'];
    return config;
  },
}

module.exports = nextConfig
