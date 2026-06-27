import { NextResponse } from 'next/server';
import os from 'os';

export async function GET() {
  try {
    const interfaces = os.networkInterfaces();
    let hostIp = 'localhost';

    // Find the first non-internal IPv4 address
    for (const name of Object.keys(interfaces)) {
      const iface = interfaces[name];
      if (!iface) continue;
      for (const alias of iface) {
        if (alias.family === 'IPv4' && !alias.internal) {
          hostIp = alias.address;
          break;
        }
      }
      if (hostIp !== 'localhost') break;
    }

    const port = process.env.PORT || '3075';
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `http://${hostIp}:${port}`;

    return NextResponse.json({ baseUrl, hostIp, port });
  } catch (error) {
    return NextResponse.json({ baseUrl: 'http://localhost:3075', hostIp: 'localhost', port: '3075' });
  }
}
