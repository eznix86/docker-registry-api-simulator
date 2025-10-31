import fs from "fs";
import path from "path";
import chalk from "chalk";
import { randomUUID } from "crypto";
import dockerRepos from "~/docker-repos.json";
import type { Template, RepositoryWithConfig } from "~/types";

const log = console.log;

const ADDITIONAL_SUFFIXES = [
  "dev", "server", "proxy", "cache", "broker",
  "gateway", "service", "monitor", "logger", "tracer",
  "runner", "agent", "tool", "mgr", "vault",
  "balancer", "node", "scheduler", "queue", "bus", "processor"
];

const ORG_PREFIXES = [
  "library", "company", "myorg", "devteam", "platform", "infra",
  "services", "apps", "tools", "internal", "public"
];

const ensureDirExists = (dirPath: string): void => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const generateTags = (repoIndex: number, count: number): string[] =>
  Array.from({ length: count }, (_, j) => `v${repoIndex + 1}.${j}.0`);

const pickRepoName = (index: number, usedNames: Set<string>): string => {
  const baseName = dockerRepos[Math.floor(Math.random() * dockerRepos.length)];

  const usePrefix = Math.random() < 0.2;
  const prefix = usePrefix
    ? ORG_PREFIXES[Math.floor(Math.random() * ORG_PREFIXES.length)] + "/"
    : "";

  let repoName = prefix + baseName;
  if (!usedNames.has(repoName)) {
    return repoName;
  }

  for (const suffix of ADDITIONAL_SUFFIXES) {
    repoName = prefix + baseName + "-" + suffix;
    if (!usedNames.has(repoName)) {
      return repoName;
    }
  }

  // Fallback: add numbers
  let counter = 1;
  do {
    repoName = prefix + baseName + "-" + counter;
    counter++;
  } while (usedNames.has(repoName));

  return repoName;
};

const createRepository = (
  index: number,
  tagsPerRepo: number,
  extraTags: number,
  usedNames: Set<string>
): RepositoryWithConfig => {
  const repoName = pickRepoName(index, usedNames);
  usedNames.add(repoName);

  const isMultiarch = index % 3 === 0;
  const format: "docker" | "oci" = index % 5 === 0 ? "docker" : "oci";

  const tagCount = index === 0 ? tagsPerRepo + extraTags : tagsPerRepo;

  const repo: RepositoryWithConfig = {
    name: repoName,
    tags: generateTags(index, tagCount),
  };

  if (format === "docker") {
    repo.format = "docker";
  }

  if (isMultiarch) {
    repo.multiarch = true;
  }

  return repo;
};

export const generateTemplate = (repoCount: number, totalTags: number, hasAuth: boolean): Template => {
  const tagsPerRepo = Math.floor(totalTags / repoCount);
  const extraTags = totalTags % repoCount;

  log(chalk.blue(`Generating JSONC with ${repoCount} repos and ${totalTags} tags...`));
  log(chalk.gray(`- ${tagsPerRepo} tags per repo`));
  log(chalk.gray(`- First repo gets ${tagsPerRepo + extraTags} tags`));

  const usedNames = new Set<string>();
  const repositories = Array.from({ length: repoCount }, (_, i) =>
    createRepository(i, tagsPerRepo, extraTags, usedNames)
  );

  const template: Template = {
    $schema: "https://raw.githubusercontent.com/eznix86/docker-registry-api-simulator/main/template.schema.json",
    repositories,
  };

  if (hasAuth) {
    template.auth = [{ username: "admin", password: "admin123" }];
  }

  return template;
};

export const generateTemplateFile = (
  repoCount: number,
  totalTags: number,
  outputPath: string | undefined,
  hasAuth: boolean
): void => {
  // Generate UUID-based filename if output not specified
  const finalOutputPath = outputPath || path.join("templates", `${randomUUID()}.jsonc`);

  const outputDir = path.dirname(finalOutputPath);
  ensureDirExists(outputDir);

  const template = generateTemplate(repoCount, totalTags, hasAuth);
  fs.writeFileSync(finalOutputPath, JSON.stringify(template, null, 2), "utf8");

  log(chalk.green(`Generated: ${finalOutputPath}`));
  log(chalk.cyan(`Total repos: ${repoCount}`));
  log(chalk.cyan(`Total tags: ${totalTags}`));
  log(chalk.cyan(`Authentication: ${hasAuth ? "enabled" : "disabled"}`));
};
