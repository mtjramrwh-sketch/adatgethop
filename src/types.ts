export interface DeployConfig {
  appName: string;
  pat: string;
  owner: string;
  repo: string;
  branch: string;
  message: string;
  subfolder: string;
  cleanSync: boolean;
  pwaSafeguard: boolean;
}

export type LogType = "info" | "progress" | "success" | "error" | "warn";

export interface LogEntry {
  id: string;
  timestamp: string;
  type: LogType;
  message: string;
  data?: any;
}

export interface UploadResponse {
  fileId: string;
  originalName: string;
  size: number;
}
