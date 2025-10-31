import chalk from "chalk";
import Ajv from "ajv";
import { readFileSync } from "fs";
import { resolve } from "path";

const log = console.log;

// Load and compile JSON schemas
const templateSchemaPath = resolve("template.schema.json");
const templateSchemaJson = JSON.parse(readFileSync(templateSchemaPath, "utf-8"));

const databaseSchemaPath = resolve("database.schema.json");
const databaseSchemaJson = JSON.parse(readFileSync(databaseSchemaPath, "utf-8"));

const ajv = new Ajv({ allErrors: true, strict: false });
const validateTemplateSchema = ajv.compile(templateSchemaJson);
const validateDatabaseSchema = ajv.compile(databaseSchemaJson);

export function validateDatabase(data: unknown): void {
  const valid = validateDatabaseSchema(data);

  if (!valid) {
    console.error(`${chalk.red("Database validation failed:")}`);

    if (validateDatabaseSchema.errors) {
      for (const error of validateDatabaseSchema.errors) {
        const path = error.instancePath || "root";
        const message = error.message || "validation error";
        console.error(`${chalk.yellow(`  - ${path}:`)} ${message}`);

        if (error.params && Object.keys(error.params).length > 0) {
          const params = JSON.stringify(error.params);
          console.error(`${chalk.gray(`    ${params}`)}`);
        }
      }
    }

    throw new Error(
      "Database validation failed. Please check the errors above.",
    );
  }

  log(`${chalk.green("Database validation passed")}`);
}

export function validateSemantics(data: any): void {
  const errors: string[] = [];

  // Validate tag references to manifests
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

  // Validate repositories have corresponding tags
  for (const repoName of Object.keys(data.tags)) {
    if (!data.repositories.some((r: any) => r.name === repoName)) {
      errors.push(
        `Repository "${repoName}" has tags but is not defined in repositories array`,
      );
    }
  }

  // Validate manifest config references to blobs
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

  // Validate multi-arch manifest references
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

export function validateTemplate(data: unknown): void {
  const valid = validateTemplateSchema(data);

  if (!valid) {
    console.error(`${chalk.red("Template validation failed:")}`);

    if (validateTemplateSchema.errors) {
      for (const error of validateTemplateSchema.errors) {
        const path = error.instancePath || "root";
        const message = error.message || "validation error";
        console.error(`${chalk.yellow(`  - ${path}:`)} ${message}`);

        if (error.params && Object.keys(error.params).length > 0) {
          const params = JSON.stringify(error.params);
          console.error(`${chalk.gray(`    ${params}`)}`);
        }
      }
    }

    throw new Error(
      "Template validation failed. Please check the errors above.",
    );
  }

  log(`${chalk.green("Template validation passed")}`);
}
