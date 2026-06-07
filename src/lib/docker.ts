import Docker from 'dockerode';
import os from 'os';
import path from 'path';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// Test Docker connection on startup
docker.ping((err) => {
  if (err) {
    console.error('Docker connection failed:', err);
  } else {
    console.log('Docker connection successful');
  }
});

const LAB_NETWORK = 'hackforge-network';
const LAB_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours
const MEMORY_LIMIT = 512 * 1024 * 1024; // 512MB
const CPU_LIMIT = 0.5;

// Lab ID to Dockerfile path mapping
const LAB_DOCKERFILE_MAP: { [key: string]: string } = {
  '1': 'docker/idor-basic',
  '2': 'docker/sqli-basic',
  '3': 'docker/xss-reflected',
  '4': 'docker/csrf-bypass',
  '5': 'docker/lfi-basic',
  '6': 'docker/cmd-injection',
  '7': 'docker/file-upload',
  '8': 'docker/xxe-injection',
  '9': 'docker/ssrf-basic',
  '10': 'docker/jwt-bypass',
  '11': 'docker/privesc-linux',
  '12': 'docker/bof-basic'
};

// Build image from local Dockerfile if it doesn't exist
async function buildImageIfNeeded(labId: string): Promise<string> {
  const dockerfilePath = LAB_DOCKERFILE_MAP[labId];
  if (!dockerfilePath) {
    throw new Error(`No Dockerfile found for lab ID: ${labId}`);
  }

  const imageName = `hackforge/${dockerfilePath.split('/').pop()}:latest`;
  
  try {
    await docker.getImage(imageName).inspect();
    console.log(`Image ${imageName} already exists locally, skipping build`);
    return imageName;
  } catch (err) {
    // Image doesn't exist locally, build it
    console.log(`Building image ${imageName} from ${dockerfilePath}...`);
    
    const buildContext = path.resolve(process.cwd(), dockerfilePath);
    
    return new Promise((resolve, reject) => {
      docker.buildImage({
        context: buildContext,
        src: ['.']
      }, { t: imageName }, (error: Error | null, stream: NodeJS.ReadableStream) => {
        if (error) {
          console.error('Error building image:', error);
          return reject(error);
        }
        
        docker.modem.followProgress(stream, (err: Error | null) => {
          if (err) {
            console.error('Error following build progress:', err);
            return reject(err);
          }
          console.log(`Successfully built image ${imageName}`);
          resolve(imageName);
        });
      });
    });
  }
}

export interface ContainerConfig {
  labId: string;
  userId: string;
  dockerImage: string;
  ports: number[];
  terminalEnabled: boolean;
}

export interface ContainerInfo {
  containerId: string;
  ip: string;
  port: number;
  expiresAt: Date;
  terminalPort?: number;
}

export interface ContainerStatus {
  status: 'running' | 'stopped' | 'expired' | 'not_found';
  timeRemaining: number;
  ip: string;
  port: number;
  terminalPort?: number;
}

// Ensure the lab network exists
export async function ensureLabNetwork(): Promise<void> {
  try {
    console.log('Ensuring lab network exists:', LAB_NETWORK);
    const networks = await docker.listNetworks();
    const networkExists = networks.some(n => n.Name === LAB_NETWORK);
    
    if (!networkExists) {
      await docker.createNetwork({
        Name: LAB_NETWORK,
        Driver: 'bridge',
        Internal: false,
        CheckDuplicate: true
      });
    }
  } catch (error) {
    console.error('Error ensuring lab network:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    throw new Error('Failed to ensure lab network exists');
  }
}

// Deploy a new container for a lab
export async function deployContainer(config: ContainerConfig): Promise<ContainerInfo> {
  try {
    console.log('Deploying container for lab:', config.labId);
    await ensureLabNetwork();
    
    // Build the image from local Dockerfile if it doesn't exist
    const imageName = await buildImageIfNeeded(config.labId);
    
    // Generate a unique container name
    const containerName = `lab-${config.labId}-${config.userId}-${Date.now()}`;
    
    // Prepare port bindings - only expose to Docker network, not host
    const exposedPorts: { [key: string]: {} } = {};
    
    config.ports.forEach(port => {
      const portKey = `${port}/tcp`;
      exposedPorts[portKey] = {};
    });
    
    // Add terminal port if enabled
    if (config.terminalEnabled) {
      const terminalPortKey = '7681/tcp';
      exposedPorts[terminalPortKey] = {};
    }
    
    // Create and start the container
    const container = await docker.createContainer({
      name: containerName,
      Image: imageName,
      ExposedPorts: exposedPorts,
      HostConfig: {
        Memory: MEMORY_LIMIT,
        CpuQuota: CPU_LIMIT * 100000,
        NetworkMode: LAB_NETWORK,
        AutoRemove: false
      },
      Labels: {
        'lab-id': config.labId,
        'user-id': config.userId,
        'expires-at': new Date(Date.now() + LAB_TIMEOUT_MS).toISOString()
      }
    });
    
    await container.start();
    
    // Get container info
    const containerInfo = await container.inspect();
    const networkSettings = containerInfo.NetworkSettings.Networks[LAB_NETWORK];
    
    // Get the internal port (not host port since we're not exposing to host)
    const internalPort = config.ports[0] || 80;
    
    // Get terminal port if enabled
    let terminalPort: number | undefined;
    if (config.terminalEnabled) {
      terminalPort = 7681;
    }
    
    return {
      containerId: container.id,
      ip: networkSettings?.IPAddress || 'localhost',
      port: internalPort,
      expiresAt: new Date(Date.now() + LAB_TIMEOUT_MS),
      terminalPort
    };
  } catch (error) {
    console.error('Error deploying container:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    throw new Error('Failed to deploy container');
  }
}

// Terminate a container
export async function terminateContainer(containerId: string): Promise<boolean> {
  try {
    const container = docker.getContainer(containerId);
    
    // Stop the container
    await container.stop({ t: 10 });
    
    // Remove the container
    await container.remove();
    
    return true;
  } catch (error) {
    console.error('Error terminating container:', error);
    throw new Error('Failed to terminate container');
  }
}

// Get container status
export async function getContainerStatus(containerId: string): Promise<ContainerStatus> {
  try {
    const container = docker.getContainer(containerId);
    const containerInfo = await container.inspect();
    
    const state = containerInfo.State;
    const labels = containerInfo.Config.Labels || {};
    const expiresAt = labels['expires-at'] ? new Date(labels['expires-at']) : new Date(Date.now() + LAB_TIMEOUT_MS);
    
    // Get network info
    const networkSettings = containerInfo.NetworkSettings.Networks[LAB_NETWORK];
    const ip = networkSettings?.IPAddress || 'localhost';
    
    // Get internal port from exposed ports
    const ports = containerInfo.NetworkSettings.Ports;
    const portKeys = Object.keys(ports).filter(k => k !== '7681/tcp');
    const port = portKeys.length > 0 ? parseInt(portKeys[0].split('/')[0]) : 80;
    
    // Get terminal port if available
    let terminalPort: number | undefined;
    if (ports['7681/tcp']) {
      terminalPort = 7681;
    }
    
    // Determine status
    let status: 'running' | 'stopped' | 'expired' | 'not_found';
    const now = new Date();
    
    if (state.Running) {
      if (now > expiresAt) {
        status = 'expired';
      } else {
        status = 'running';
      }
    } else if (state.Status === 'exited') {
      status = 'stopped';
    } else {
      status = 'not_found';
    }
    
    const timeRemaining = Math.max(0, expiresAt.getTime() - now.getTime());
    
    return {
      status,
      timeRemaining,
      ip,
      port,
      terminalPort
    };
  } catch (error) {
    console.error('Error getting container status:', error);
    return {
      status: 'not_found',
      timeRemaining: 0,
      ip: 'localhost',
      port: 0
    };
  }
}

// Reset a container (terminate and deploy fresh)
export async function resetContainer(config: ContainerConfig, oldContainerId: string): Promise<ContainerInfo> {
  try {
    console.log('Resetting container for lab:', config.labId);
    // Terminate old container
    await terminateContainer(oldContainerId);
    
    // Deploy new container
    return await deployContainer(config);
  } catch (error) {
    console.error('Error resetting container:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    throw new Error('Failed to reset container');
  }
}

// Clean up expired containers (should be run periodically)
export async function cleanupExpiredContainers(): Promise<number> {
  try {
    const containers = await docker.listContainers({ all: true });
    let cleaned = 0;
    
    for (const containerInfo of containers) {
      const labels = containerInfo.Labels || {};
      const expiresAt = labels['expires-at'];
      
      if (expiresAt && new Date(expiresAt) < new Date()) {
        const container = docker.getContainer(containerInfo.Id);
        try {
          await container.stop({ t: 5 });
          await container.remove();
          cleaned++;
        } catch (error) {
          console.error(`Error cleaning up container ${containerInfo.Id}:`, error);
        }
      }
    }
    
    return cleaned;
  } catch (error) {
    console.error('Error cleaning up expired containers:', error);
    return 0;
  }
}
