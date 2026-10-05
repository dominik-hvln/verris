import { BadGatewayException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
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
  server_type?: { architecture?: 'x86' | 'arm' };
}

/** Obraz (snapshot albo system) — pola wg https://docs.hetzner.cloud/reference/cloud (Images). */
export interface HetznerImage {
  id: number;
  type: 'system' | 'app' | 'snapshot' | 'backup';
  status: 'available' | 'creating' | 'unavailable';
  name: string | null;
  description: string;
  /** GB w magazynie dostawcy — podstawa rozliczenia snapshotu; null, dopóki obraz powstaje. */
  image_size: number | null;
  created: string;
  architecture: 'x86' | 'arm';
  labels: Record<string, string>;
}

/** Akcja asynchroniczna (GET /actions/{id}). */
export interface HetznerAction {
  id: number;
  command: string;
  status: 'running' | 'success' | 'error';
  progress: number;
  resources: Array<{ id: number; type: string }>;
  error: { code: string; message: string } | null;
}

/** Komunikat dla klienta — bez nazwy dostawcy (white label). Szczegół idzie do logu. */
const BLAD_DLA_KLIENTA = 'Operacja na serwerze VPS nie powiodła się. Spróbuj ponownie za chwilę.';

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
    if (!token) throw new BadGatewayException('Usługa VPS jest chwilowo niedostępna.');
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
      this.logger.warn(`Hetzner ${init.method ?? 'GET'} ${path} niedostępne: ${(err as Error).message}`);
      throw new BadGatewayException(BLAD_DLA_KLIENTA);
    }
    const text = await res.text();
    const body = text ? (JSON.parse(text) as unknown) : null;
    if (!res.ok) {
      const error = (body as { error?: { code?: string; message?: string } } | null)?.error;
      this.logger.warn(`Hetzner ${init.method ?? 'GET'} ${path} -> ${res.status}: ${error?.code ?? ''} ${error?.message ?? ''}`);
      // Kody błędów: https://docs.hetzner.cloud/reference/cloud#description/errors
      // Wcześniej klient dostawał surowy komunikat dostawcy z jego nazwą („Hetzner API: …”).
      if (res.status === 404) throw new NotFoundException('Nie znaleziono zasobu serwera VPS.');
      if (error?.code === 'locked' || error?.code === 'conflict') {
        throw new ConflictException('Na serwerze trwa inna operacja. Spróbuj ponownie za chwilę.');
      }
      throw new BadGatewayException(BLAD_DLA_KLIENTA);
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

  // --- Q-08 snapshoty i rebuild, Q-07 konsola -------------------------------------------------
  // Źródło: https://docs.hetzner.cloud/reference/cloud (spec: https://docs.hetzner.cloud/cloud.spec.json),
  // operationId w nawiasach. Akcje są asynchroniczne — stan sprawdza się przez GET /actions/{id}.

  /** POST /servers/{id}/actions/create_image (create_server_image) — `type: snapshot`. */
  async createSnapshot(
    serverId: string,
    input: { description: string; labels: Record<string, string> },
  ): Promise<{ image: HetznerImage; actionId: number | null }> {
    const res = await this.request<{ image: HetznerImage; action?: { id: number } }>(
      `/servers/${serverId}/actions/create_image`,
      { method: 'POST', body: JSON.stringify({ type: 'snapshot', description: input.description, labels: input.labels }) },
    );
    return { image: res.image, actionId: res.action?.id ?? null };
  }

  /** GET /images?type=snapshot&label_selector=… (list_images). */
  async listSnapshots(labelSelector: string): Promise<HetznerImage[]> {
    const q = new URLSearchParams({ type: 'snapshot', label_selector: labelSelector, per_page: '50' });
    const res = await this.request<{ images: HetznerImage[] }>(`/images?${q.toString()}`);
    return res.images;
  }

  /** GET /images?type=system&status=available&architecture=… (list_images) — systemy do reinstalacji. */
  async listSystemImages(architecture: 'x86' | 'arm'): Promise<HetznerImage[]> {
    const q = new URLSearchParams({ type: 'system', status: 'available', architecture, per_page: '50' });
    const res = await this.request<{ images: HetznerImage[] }>(`/images?${q.toString()}`);
    return res.images;
  }

  /** DELETE /images/{id} (delete_image) — tylko snapshot/backup. */
  async deleteImage(id: string): Promise<void> {
    await this.request(`/images/${id}`, { method: 'DELETE' });
  }

  /**
   * POST /servers/{id}/actions/rebuild (rebuild_server) — nadpisuje dysk obrazem (ID albo nazwa),
   * niszcząc dane. `root_password` przychodzi, gdy serwer nie używa kluczy SSH.
   */
  async rebuild(serverId: string, image: string): Promise<{ rootPassword: string | null; actionId: number }> {
    const res = await this.request<{ root_password?: string | null; action: { id: number } }>(
      `/servers/${serverId}/actions/rebuild`,
      { method: 'POST', body: JSON.stringify({ image }) },
    );
    return { rootPassword: res.root_password ?? null, actionId: res.action.id };
  }

  /** GET /actions/{id} (get_action). */
  async getAction(id: string): Promise<HetznerAction> {
    const res = await this.request<{ action: HetznerAction }>(`/actions/${id}`);
    return res.action;
  }

  /**
   * POST /servers/{id}/actions/request_console (request_server_console) — VNC przez websocket.
   * URL ważny 1 minutę na nawiązanie połączenia; hasło jednorazowe dla tej sesji.
   */
  async requestConsole(serverId: string): Promise<{ wssUrl: string; password: string }> {
    const res = await this.request<{ wss_url: string; password: string }>(
      `/servers/${serverId}/actions/request_console`,
      { method: 'POST' },
    );
    return { wssUrl: res.wss_url, password: res.password };
  }
}
