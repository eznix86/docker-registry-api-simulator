import type { DatabaseSchema } from "./types";

export const DEFAULT_DATABASE: DatabaseSchema = {
  auth: [],
  repositories: [],
  tags: {},
  manifests: {},
  blobs: {},
};

export const DOCKER_DISTRIBUTION_API_VERSION = "registry/2.0";
