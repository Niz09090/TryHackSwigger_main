import { NextRequest, NextResponse } from 'next/server';
import { deployContainer } from '@/lib/docker';
import { mockLabs } from '@/lib/mockData';
import Docker from 'dockerode';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { labId, userId } = body;

    console.log('Deploying lab with ID:', labId);

    if (!labId || !userId) {
      return NextResponse.json(
        { error: 'Missing required fields: labId and userId' },
        { status: 400 }
      );
    }

    // Find the lab
    const lab = mockLabs.find(l => l.id === labId);
    if (!lab) {
      console.error('Lab not found with ID:', labId);
      return NextResponse.json(
        { error: 'Lab not found' },
        { status: 404 }
      );
    }

    console.log('Found lab:', lab.title, 'with dockerImage:', lab.dockerImage);

    // Clean up old containers for this lab and user
    try {
      const containers = await docker.listContainers({ all: true });
      for (const container of containers) {
        const containerName = container.Names[0]?.replace(/^\//, '');
        if (containerName && containerName.includes(`lab-${labId}-${userId}`)) {
          console.log('Removing old container:', containerName);
          const containerObj = docker.getContainer(container.Id);
          try {
            await containerObj.stop();
          } catch (e) {
            // Container might already be stopped
          }
          await containerObj.remove();
        }
      }
    } catch (cleanupError) {
      console.error('Error during container cleanup:', cleanupError);
      // Continue with deployment even if cleanup fails
    }

    // Deploy the container
    const containerInfo = await deployContainer({
      labId,
      userId,
      dockerImage: lab.dockerImage,
      ports: lab.ports,
      terminalEnabled: lab.terminalEnabled
    });

    return NextResponse.json({
      containerId: containerInfo.containerId,
      ip: containerInfo.ip,
      port: containerInfo.port,
      expiresAt: containerInfo.expiresAt,
      terminalPort: containerInfo.terminalPort
    });
  } catch (error) {
    console.error('Error deploying container:', error);
    return NextResponse.json(
      { error: 'Failed to deploy container. Make sure Docker is running.' },
      { status: 500 }
    );
  }
}
