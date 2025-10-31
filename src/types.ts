// Shared type definitions for the Docker Registry API simulator

export interface AuthEntry {
  username: string;
  password: string;
}

export interface Repository {
  name: string;
}

export interface RepositoryWithConfig extends Repository {
  format?: "oci" | "docker";
  multiarch?: boolean;
  architectures?: string[];
  os?: string;
  tags: string[];
}

export interface Tag {
  tag: string;
  digest: string;
}

export interface Manifest {
  type: "oci" | "docker" | "oci-index" | "docker-list";
  data: ManifestData;
}

export interface ManifestData {
  schemaVersion: number;
  mediaType: string;
  config?: {
    mediaType: string;
    digest: string;
    size: number;
  };
  layers?: Array<{
    mediaType: string;
    digest: string;
    size: number;
  }>;
  manifests?: Array<{
    mediaType: string;
    digest: string;
    size: number;
    platform: {
      architecture: string;
      os: string;
    };
  }>;
}

export interface DatabaseSchema {
  auth: AuthEntry[];
  repositories: Repository[];
  tags: Record<string, Tag[]>;
  manifests: Record<string, Manifest>;
  blobs: Record<string, any>;
}

export interface Template {
  $schema?: string;
  auth?: AuthEntry[];
  repositories: RepositoryWithConfig[];
}

// Config blob types
export interface ConfigBlob {
  architecture: string;
  os: string;
  created: string;
  config: ImageConfig;
  rootfs: ImageRootFS;
  history: ImageHistoryEntry[];
}

export interface ImageConfig {
  User?: string;
  ExposedPorts?: Record<string, Record<string, never>>;
  Env?: string[];
  Entrypoint?: string[];
  Cmd?: string[];
  Volumes?: Record<string, Record<string, never>>;
  WorkingDir?: string;
  Labels?: Record<string, string>;
  StopSignal?: string;
}

export interface ImageRootFS {
  type: string;
  diff_ids: string[];
}

export interface ImageHistoryEntry {
  created?: string;
  created_by?: string;
  comment?: string;
  empty_layer?: boolean;
}
