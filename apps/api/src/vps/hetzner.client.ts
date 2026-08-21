import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const API_BASE = 'https://api.hetzner.cloud/v1';

export interface HetznerServer {
  id: number;
  name: string;
  status: string; // running | off | starting | stopping | ...
  public_net?: {
    ipv4?: { ip: string } | null;
    ipv6?: { ip: string } | null;
  };
  datacenter?: { location?: { name: string } };
}

export interface HetznerCreateResult {
  server: HetznerServer;
  rootPassword: string | null;
  actionId: number | null;
}

/**
 * Minimal, real Hetzner Cloud API client (https://api.hetzner.cloud/v1).
 * Auth via HETZNER_API_TOKEN (Bearer). Only the calls the resale flow needs.
 */
@Injectable()
export class HetznerClient {
  private readonly logger = new Logger(HetznerClient.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.token());
  }

  private token(): string {
    return (this.config.get<string>('HETZNER_API_TOKEN') ?? process.env.HETZNER_API_TOKEN ?? '').trim();
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = this.token();
    if (!token) throw new BadGatewayException('Hetzner API nie jest skonfigurowane (HETZNER_API_TOKEN).');
    let res: Response;
    try {
      res = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
        },
      });
    } catch (err) {
      throw new BadGatewayException(`Hetzner API niedostępne: ${(err as Error).message}`);
    }
    const text = await res.text();
    const body = text ? (JSON.parse(text) as unknown) : null;
    if (!res.ok) {
      const msg =
        (body as { error?: { message?: string } } | null)?.error?.message ?? `HTTP ${res.status}`;
      this.logger.warn(`Hetzner ${init.method ?? 'GET'} ${path} -> ${res.status}: ${msg}`);
      throw new BadGatewayException(`Hetzner API: ${msg}`);
    }
    return body as T;
  }

  /** Create a server. Without an SSH key Hetzner returns a one-time root password. */
  async createServer(input: {
    name: string;
    serverType: string;
    image: string;
    location: string;
    userData?: string;
    sshKeyIds?: number[];
  }): Promise<HetznerCreateResult> {
    const payload: Record<string, unknown> = {
      name: input.name,
      server_type: input.serverType,
      image: input.image,
      location: input.location,
      start_after_create: true,
      ...(input.userData ? { user_data: input.userData } : {}),
      ...(input.sshKeyIds && input.sshKeyIds.length ? { ssh_keys: input.sshKeyIds } : {}),
    };
    const res = await this.request<{
      server: HetznerServer;
      root_password: string | null;
      action?: { id: number };
    }>('/servers', { method: 'POST', body: JSON.stringify(payload) });
    return { server: res.server, rootPassword: res.root_password, actionId: res.action?.id ?? null };
  }

  async getServer(id: string): Promise<HetznerServer | null> {
    try {
      const res = await this.request<{ server: HetznerServer }>(`/servers/${id}`);
      return res.server;
    } catch {
      return null;
    }
  }

  async deleteServer(id: string): Promise<void> {
    await this.request(`/servers/${id}`, { method: 'DELETE' });
  }

  async powerOn(id: string): Promise<void> {
    await this.request(`/servers/${id}/actions/poweron`, { method: 'POST' });
  }

  async powerOff(id: string): Promise<void> {
    await this.request(`/servers/${id}/actions/poweroff`, { method: 'POST' });
  }

  async reboot(id: string): Promise<void> {
    await this.request(`/servers/${id}/actions/reboot`, { method: 'POST' });
  }

  /** Upload an SSH public key to the project; returns its numeric id. */
  async createSshKey(input: { name: string; publicKey: string }): Promise<{ id: number; fingerprint: string }> {
    const res = await this.request<{ ssh_key: { id: number; fingerprint: string } }>('/ssh_keys', {
      method: 'POST',
      body: JSON.stringify({ name: input.name, public_key: input.publicKey }),
    });
    return { id: res.ssh_key.id, fingerprint: res.ssh_key.fingerprint };
  }

  async deleteSshKey(id: string): Promise<void> {
    await this.request(`/ssh_keys/${id}`, { method: 'DELETE' });
  }

  /** Catalogue helpers for the admin plan builder. */
  async listServerTypes(): Promise<Array<{ name: string; cores: number; memory: number; disk: number }>> {
    const res = await this.request<{
      server_types: Array<{ name: string; cores: number; memory: number; disk: number }>;
    }>('/server_types?per_page=50');
    return res.server_types;
  }
}
