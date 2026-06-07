import { NextRequest, NextResponse } from 'next/server';
import Docker from 'dockerode';
import os from 'os';

const docker = new Docker(
  os.platform() === 'win32'
    ? { socketPath: '//./pipe/docker_engine' }
    : { socketPath: '/var/run/docker.sock' }
);

const LAB_NETWORK = 'hackforge-network';

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
    // Find the container by lab ID label
    const containers = await docker.listContainers({ all: true });
    const containerInfo = containers.find(c => 
      c.Labels['lab-id'] === labId && 
      c.State === 'running'
    );

    if (!containerInfo) {
      return NextResponse.json(
        { error: 'Lab container not found or not running' },
        { status: 404 }
      );
    }

    const container = docker.getContainer(containerInfo.Id);
    const containerDetails = await container.inspect();
    
    // Get the container's internal IP and port
    const networkSettings = containerDetails.NetworkSettings.Networks[LAB_NETWORK];
    if (!networkSettings) {
      return NextResponse.json(
        { error: 'Container not on hackforge network' },
        { status: 500 }
      );
    }

    const containerIP = networkSettings.IPAddress;
    
    // Get the exposed port (first non-terminal port)
    const ports = containerDetails.NetworkSettings.Ports;
    const portKeys = Object.keys(ports).filter(k => k !== '7681/tcp');
    const targetPort = portKeys.length > 0 ? parseInt(portKeys[0].split('/')[0]) : 80;

    // Build the target URL
    const pathString = path.join('/') || '/';
    const targetUrl = `http://${containerIP}:${targetPort}${pathString}${request.nextUrl.search}`;
    
    // Proxy the request
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: {
        ...Object.fromEntries(request.headers.entries()),
        host: `${containerIP}:${targetPort}`,
      },
      body: request.body,
      // @ts-ignore
      duplex: 'half',
    });

    // Return the response
    const responseBody = await response.arrayBuffer();
    
    return new NextResponse(responseBody, {
      status: response.status,
      headers: {
        ...Object.fromEntries(response.headers.entries()),
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
    });
  } catch (error) {
    console.error('Proxy error:', error);
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
