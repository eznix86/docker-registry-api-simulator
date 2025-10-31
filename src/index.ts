#!/usr/bin/env bun
import { Command } from "commander";
import ora from "ora";
import chalk from "chalk";
import { createServer } from "~/server";
import { generateDatabaseFromTemplate } from "~/generator";

const log = console.log

const program = new Command();

program
  .name("registry-api-simulator")
  .description("Docker Registry API v2 simulator")
  .version("1.0.0");

program
  .command("serve")
  .description("Start the Docker Registry API v2 simulator server")
  .option(
    "-f, --db-file <path>",
    "Path to the database JSON file",
    "data/db.json",
  )
  .option("-p, --port <number>", "Port to listen on", "5001")
  .option(
    "-t, --throttle [ms]",
    "Add response delay (default: 250ms if flag used without value)",
  )
  .action(async (options) => {
    log(
      `${chalk.blue("Starting server with database:")} ${chalk.cyan(options.dbFile)}`,
    );

    process.stdout.write("");

    // Handle throttle: undefined = 0, true = 250, number = that number
    let throttle = 0;
    if (options.throttle !== undefined) {
      throttle = options.throttle === true ? 250 : parseInt(options.throttle);
    }
    setImmediate(async () => {
      const server = await createServer(
        options.dbFile,
        parseInt(options.port),
        throttle,
      );
      server.start();
    });
  });

program
  .command("generate")
  .description("Generate a database from a template file")
  .argument("<template>", "Path to template file (YAML or JSONC)")
  .option("-o, --output <file>", "Output database file path (default: data/[uuid].json)")
  .action(async (template, options) => {
    const spinner = ora("Generating database from template...").start();

    try {
      await generateDatabaseFromTemplate(template, options.output);
      spinner.succeed(chalk.green("Database generated successfully"));
    } catch (error) {
      spinner.fail(chalk.red("Generation failed"));
      if (error instanceof Error) {
        console.error(chalk.red(error.message));
      } else {
        console.error(error);
      }
      process.exit(1);
    }
  });

program
  .command("validate")
  .description("Validate a database JSON file")
  .argument("<file>", "Path to database JSON file to validate")
  .action(async (file) => {
    const spinner = ora("Validating database file...").start();

    try {
      const { JSONFilePreset } = await import("lowdb/node");
      const { validateDatabase, validateSemantics } = await import(
        "~/utils/validator"
      );
      const { DEFAULT_DATABASE } = await import("~/constants");

      const db = await JSONFilePreset(file, DEFAULT_DATABASE);

      validateDatabase(db.data);
      validateSemantics(db.data);

      spinner.succeed(chalk.green("Validation successful"));

      log(`
${chalk.cyan("Database Statistics:")}
  ${chalk.gray("Repositories:")} ${chalk.white(db.data.repositories?.length || 0)}
  ${chalk.gray("Total tags:")} ${chalk.white(Object.values(db.data.tags || {}).reduce((sum: number, tags: any) => sum + tags.length, 0))}
  ${chalk.gray("Manifests:")} ${chalk.white(Object.keys(db.data.manifests || {}).length)}
  ${chalk.gray("Blobs:")} ${chalk.white(Object.keys(db.data.blobs || {}).length)}`);

      process.exit(0);
    } catch (error) {
      spinner.fail(chalk.red("Validation failed"));

      if (error instanceof Error) {
        console.error(chalk.red(error.message));
      } else {
        console.error(error);
      }

      process.exit(1);
    }
  });

program
  .command("generate-template")
  .description("Generate a template file with repositories and tags")
  .option("-r, --repos <number>", "Number of repositories", "100")
  .option("-t, --tags <number>", "Total number of tags", "1001")
  .option("-o, --output <path>", "Output file path (default: templates/[uuid].jsonc)")
  .option("-a, --auth", "Include authentication credentials")
  .action(async (options) => {
    const { generateTemplateFile } = await import("~/generate-template");

    const repoCount = parseInt(options.repos, 10);
    const totalTags = parseInt(options.tags, 10);
    const outputPath = options.output;
    const hasAuth = !!options.auth;

    if (isNaN(repoCount) || repoCount <= 0) {
      console.error(chalk.red("Error: --repos must be a positive integer"));
      process.exit(1);
    }

    if (isNaN(totalTags) || totalTags <= 0) {
      console.error(chalk.red("Error: --tags must be a positive integer"));
      process.exit(1);
    }

    try {
      generateTemplateFile(repoCount, totalTags, outputPath, hasAuth);
    } catch (error) {
      if (error instanceof Error) {
        console.error(chalk.red(error.message));
      } else {
        console.error(error);
      }
      process.exit(1);
    }
  });

program.parse();
