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
  { params }: { params: { labId: string } }
) {
  return handleProxy(request, params.labId, []);
}

export async function POST(
  request: NextRequest,
  { params }: { params: { labId: string } }
) {
  return handleProxy(request, params.labId, []);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { labId: string } }
) {
  return handleProxy(request, params.labId, []);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { labId: string } }
) {
  return handleProxy(request, params.labId, []);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { labId: string } }
) {
  return handleProxy(request, params.labId, []);
}

async function handleProxy(
  request: NextRequest,
  labId: string,
  path: string[]
) {
  try {
    console.log('Proxy request received - labId:', labId, 'path:', path);
    
    // Find the container by lab ID label
    const containers = await docker.listContainers({ all: true });
    console.log('Total containers:', containers.length);
    
    const containerInfo = containers.find(c => 
      c.Labels['lab-id'] === labId && 
      c.State === 'running'
    );

    if (!containerInfo) {
      console.log('Container not found for labId:', labId);
      console.log('Available containers with lab-id label:', 
        containers.filter(c => c.Labels['lab-id']).map(c => ({
          id: c.Id.substring(0, 12),
          labId: c.Labels['lab-id'],
          state: c.State
        }))
      );
      return NextResponse.json(
        { error: 'Lab container not found or not running' },
        { status: 404 }
      );
    }

    console.log('Found container:', containerInfo.Id.substring(0, 12), 'for labId:', labId);
    
    const container = docker.getContainer(containerInfo.Id);
    const containerDetails = await container.inspect();
    
    // Get the container's internal IP on the Docker network
    const networkSettings = containerDetails.NetworkSettings.Networks[LAB_NETWORK];
    if (!networkSettings) {
      return NextResponse.json(
        { error: 'Container not connected to lab network' },
        { status: 500 }
      );
    }
    
    const containerIP = networkSettings.IPAddress;
    
    // Build the target URL using container internal IP and port 80
    const pathString = path.join('/') || '/';
    const targetUrl = `http://${containerIP}:80${pathString}${request.nextUrl.search}`;
    
    console.log('Proxying to:', targetUrl);
    
    // Proxy the request
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: {
        ...Object.fromEntries(request.headers.entries()),
        host: `${containerIP}:80`,
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
