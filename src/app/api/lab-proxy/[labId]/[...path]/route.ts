import { NextRequest, NextResponse } from 'next/server';
import Docker from 'dockerode';
import os from 'os';

const docker = new Docker(
  os.platform() === 'win32'
    ? { socketPath: '//./pipe/docker_engine' }
    : { socketPath: '/var/run/docker.sock' }
);

const LAB_NETWORK = 'hackforge-network';

// In-memory map to store container IPs
const containerIPMap = new Map<string, string>();

export async function GET(
  request: NextRequest,
  { params }: { params: { labId: string; path: string[] } }
) {
  return handleProxy(request, params);
}

export async function POST(
  request: NextRequest,
  { params }: { params: { labId: string; path: string[] } }
) {
  return handleProxy(request, params);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { labId: string; path: string[] } }
) {
  return handleProxy(request, params);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { labId: string; path: string[] } }
) {
  return handleProxy(request, params);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { labId: string; path: string[] } }
) {
  return handleProxy(request, params);
}

async function handleProxy(
  request: NextRequest,
  { labId, path }: { labId: string; path: string[] }
) {
  try {
    console.log('=== Proxy Request ===');
    console.log('labId received:', labId);
    console.log('path:', path);
    console.log('full URL:', request.url);
    
    // Find the container by name pattern
    const containers = await docker.listContainers({ all: true });
    console.log('Total containers:', containers.length);
    
    // Log all container names and labels for debugging
    console.log('All running containers:');
    containers.forEach(c => {
      console.log(`  - Name: ${c.Names[0]}, Labels: ${JSON.stringify(c.Labels)}, State: ${c.State}`);
    });
    
    // Find container by name pattern "lab-{labId}-"
    const containerInfo = containers.find(c => 
      c.Names[0]?.includes(`lab-${labId}-`) && 
      c.State === 'running'
    );

    if (!containerInfo) {
      console.log('Container not found for labId:', labId);
      console.log('Looking for name pattern: lab-${labId}-');
      return NextResponse.json(
        { error: 'Lab container not found or not running' },
        { status: 404 }
      );
    }

    console.log('Found container:', containerInfo.Names[0], 'ID:', containerInfo.Id.substring(0, 12));
    
    const container = docker.getContainer(containerInfo.Id);
    const containerDetails = await container.inspect();
    
    // Get the container's internal IP on the Docker network
    const networkSettings = containerDetails.NetworkSettings.Networks[LAB_NETWORK];
    if (!networkSettings) {
      console.log('Container not connected to hackforge-network');
      console.log('Available networks:', Object.keys(containerDetails.NetworkSettings.Networks));
      return NextResponse.json(
        { error: 'Container not connected to lab network' },
        { status: 500 }
      );
    }
    
    const containerIP = networkSettings.IPAddress;
    console.log('Container IP on hackforge-network:', containerIP);
    
    // Build the target URL using container internal IP and port 80
    const pathString = path.join('/') || '/';
    const targetUrl = `http://${containerIP}:80${pathString}${request.nextUrl.search}`;
    
    console.log('Proxying to:', targetUrl);
    
    // Proxy the request with uncompressed response
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: {
        ...Object.fromEntries(request.headers.entries()),
        host: `${containerIP}:80`,
        'Accept-Encoding': 'identity',
      },
      body: request.body,
      // @ts-ignore
      duplex: 'half',
    });

    console.log('Response status:', response.status);
    
    // Return the response
    const responseBody = await response.arrayBuffer();
    
    // Filter out problematic headers
    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'content-encoding' && 
          key.toLowerCase() !== 'transfer-encoding' &&
          key.toLowerCase() !== 'content-length') {
        responseHeaders.set(key, value);
      }
    });
    
    return new NextResponse(responseBody, {
      status: response.status,
      headers: {
        ...Object.fromEntries(responseHeaders.entries()),
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
    });
  } catch (error) {
    console.error('Proxy error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
    return NextResponse.json(
      { error: 'Failed to proxy request to lab container' },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  });
}
