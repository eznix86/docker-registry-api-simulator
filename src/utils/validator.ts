import * as v from "valibot";
import chalk from "chalk";

const log = console.log;

// Auth user schema
const AuthUserSchema = v.object({
  username: v.pipe(v.string(), v.minLength(1, "Username must not be empty")),
  password: v.pipe(v.string(), v.minLength(1, "Password must not be empty")),
});

// Repository schema
const RepositorySchema = v.object({
  name: v.pipe(
    v.string(),
    v.minLength(1, "Repository name must not be empty"),
    v.regex(
      /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/,
      "Repository name must be lowercase alphanumeric with optional separators",
    ),
  ),
});

// Tag schema
const TagSchema = v.object({
  tag: v.pipe(v.string(), v.minLength(1, "Tag must not be empty")),
  digest: v.pipe(
    v.string(),
    v.startsWith("sha256:", "Digest must start with sha256:"),
    v.minLength(15, "Digest must be at least 15 characters"),
  ),
});

// Manifest schema
const ManifestSchema = v.object({
  type: v.picklist(
    ["oci", "docker", "oci-index", "docker-list"],
    "Type must be one of: oci, docker, oci-index, docker-list",
  ),
  data: v.object({
    schemaVersion: v.pipe(v.number(), v.integer(), v.minValue(2)),
    mediaType: v.string(),
    config: v.optional(
      v.object({
        mediaType: v.string(),
        digest: v.pipe(v.string(), v.startsWith("sha256:")),
        size: v.pipe(v.number(), v.integer(), v.minValue(0)),
      }),
    ),
    layers: v.optional(
      v.array(
        v.object({
          mediaType: v.string(),
          digest: v.pipe(v.string(), v.startsWith("sha256:")),
          size: v.pipe(v.number(), v.integer(), v.minValue(0)),
        }),
      ),
    ),
    manifests: v.optional(
      v.array(
        v.object({
          mediaType: v.string(),
          digest: v.pipe(v.string(), v.startsWith("sha256:")),
          size: v.pipe(v.number(), v.integer(), v.minValue(0)),
          platform: v.optional(
            v.object({
              architecture: v.string(),
              os: v.string(),
            }),
          ),
        }),
      ),
    ),
  }),
});

// Blob schema (config blob) - full OCI image config
const BlobSchema = v.object({
  architecture: v.optional(v.string()),
  os: v.optional(v.string()),
  created: v.optional(v.string()),
  config: v.optional(
    v.object({
      User: v.optional(v.string()),
      ExposedPorts: v.optional(v.record(v.string(), v.any())),
      Env: v.optional(v.array(v.string())),
      Entrypoint: v.optional(v.array(v.string())),
      Cmd: v.optional(v.array(v.string())),
      Volumes: v.optional(v.record(v.string(), v.any())),
      WorkingDir: v.optional(v.string()),
      Labels: v.optional(v.record(v.string(), v.string())),
      StopSignal: v.optional(v.string()),
    }),
  ),
  rootfs: v.optional(
    v.object({
      type: v.string(),
      diff_ids: v.array(v.string()),
    }),
  ),
  history: v.optional(
    v.array(
      v.object({
        created: v.optional(v.string()),
        created_by: v.optional(v.string()),
        comment: v.optional(v.string()),
        empty_layer: v.optional(v.boolean()),
      }),
    ),
  ),
});

// Database schema
const DatabaseSchema = v.object({
  auth: v.array(AuthUserSchema),
  repositories: v.array(RepositorySchema),
  tags: v.record(v.string(), v.array(TagSchema)),
  manifests: v.record(
    v.pipe(v.string(), v.startsWith("sha256:")),
    ManifestSchema,
  ),
  blobs: v.record(v.pipe(v.string(), v.startsWith("sha256:")), BlobSchema),
});

export function validateDatabase(data: unknown): void {
  try {
    v.parse(DatabaseSchema, data);
    log(`${chalk.green("Database validation passed")}`);
  } catch (error) {
    if (error instanceof v.ValiError) {
      console.error(`${chalk.red("Database validation failed:")}`);
      for (const issue of error.issues) {
        const path = issue.path?.map((p: any) => p.key).join(".") || "root";
        console.error(`${chalk.yellow(`  - ${path}:`)} ${issue.message}`);
      }
      throw new Error(
        "Database validation failed. Please check the errors above.",
      );
    }
    throw error;
  }
}

// Additional semantic validations
export function validateSemantics(data: any): void {
  const errors: string[] = [];

  // Check that all tags reference existing manifests
  for (const [repoName, tags] of Object.entries(data.tags)) {
    if (!Array.isArray(tags)) continue;

    for (const tag of tags as any[]) {
      if (!data.manifests[tag.digest]) {
        errors.push(
          `Repository "${repoName}" tag "${tag.tag}" references non-existent manifest ${tag.digest}`,
        );
      }
    }
  }

  // Check that all repositories in tags exist in repositories array
  for (const repoName of Object.keys(data.tags)) {
    if (!data.repositories.some((r: any) => r.name === repoName)) {
      errors.push(
        `Repository "${repoName}" has tags but is not defined in repositories array`,
      );
    }
  }

  // Check that manifest configs reference existing blobs
  for (const [digest, manifest] of Object.entries(data.manifests) as [
    string,
    any,
  ][]) {
    if (manifest.data.config?.digest) {
      if (!data.blobs[manifest.data.config.digest]) {
        errors.push(
          `Manifest ${digest} references non-existent config blob ${manifest.data.config.digest}`,
        );
      }
    }
  }

  // Check that multi-arch manifests reference existing platform manifests
  for (const [digest, manifest] of Object.entries(data.manifests) as [
    string,
    any,
  ][]) {
    if (manifest.type === "oci-index" || manifest.type === "docker-list") {
      if (manifest.data.manifests) {
        for (const platformManifest of manifest.data.manifests) {
          if (!data.manifests[platformManifest.digest]) {
            errors.push(
              `Multi-arch manifest ${digest} references non-existent platform manifest ${platformManifest.digest}`,
            );
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error(`${chalk.red("Semantic validation failed:")}`);
    errors.forEach((err) => console.error(`${chalk.yellow("  -")} ${err}`));
    throw new Error(
      "Database semantic validation failed. Please check the errors above.",
    );
  }

  log(`${chalk.green("Semantic validation passed")}`);
}
