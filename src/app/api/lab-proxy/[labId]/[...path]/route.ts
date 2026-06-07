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
    
    // Get the host IP and mapped port (since we're using host port mapping)
    const hostIP = '192.168.0.4';
    
    // Get the mapped host port (first non-terminal port)
    const ports = containerDetails.NetworkSettings.Ports;
    const portKeys = Object.keys(ports).filter(k => k !== '7681/tcp');
    const firstPortKey = portKeys[0];
    const portMapping = ports[firstPortKey]?.[0];
    const targetPort = portMapping ? parseInt(portMapping.HostPort) : 80;

    // Build the target URL using host IP and mapped port
    const pathString = path.join('/') || '/';
    const targetUrl = `http://${hostIP}:${targetPort}${pathString}${request.nextUrl.search}`;
    
    // Proxy the request
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: {
        ...Object.fromEntries(request.headers.entries()),
        host: `${hostIP}:${targetPort}`,
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
