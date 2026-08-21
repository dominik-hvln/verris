export type NodeTaskKind = 'HOSTING_PROFILE';

export type NodeTaskStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface HostingProfileTaskPayload {
  skipBuild?: boolean;
  dryRun?: boolean;
}

export interface NodeTaskDto {
  id: string;
  serverId: string;
  kind: NodeTaskKind;
  status: NodeTaskStatus;
  payload: HostingProfileTaskPayload | null;
  outputLog: string | null;
  errorMessage: string | null;
  requestedById: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QueueHostingProfileTaskInput {
  skipBuild?: boolean;
  dryRun?: boolean;
}

export interface TasksAgentInstallScriptDto {
  script: string;
}
