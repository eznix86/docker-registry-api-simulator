#!/usr/bin/env bun
import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { createServer } from './server';
import { generateDatabaseFromTemplate } from './generator';

const log = console.log;
const program = new Command();

program
  .name('registry-simulator')
  .description('Docker Registry API v2 simulator')
  .version('1.0.0');

program
  .command('serve')
  .description('Start the Docker Registry API v2 simulator server')
  .option('-f, --db-file <path>', 'Path to the database JSON file', 'data/db.json')
  .option('-p, --port <number>', 'Port to listen on', '5001')
  .action(async (options) => {
    log(`${chalk.blue('Starting server with database:')} ${chalk.cyan(options.dbFile)}`);

    const server = await createServer(options.dbFile, parseInt(options.port));
    server.start();
  });

program
  .command('generate')
  .description('Generate a database from a template file')
  .argument('<template>', 'Path to template file (YAML or JSONC)')
  .action(async (template) => {
    const spinner = ora('Generating database from template...').start();

    try {
      await generateDatabaseFromTemplate(template);
      spinner.succeed(chalk.green('Database generated successfully'));
    } catch (error) {
      spinner.fail(chalk.red('Generation failed'));
      if (error instanceof Error) {
        console.error(chalk.red(error.message));
      } else {
        console.error(error);
      }
      process.exit(1);
    }
  });

program
  .command('validate')
  .description('Validate a database JSON file')
  .argument('<file>', 'Path to database JSON file to validate')
  .action(async (file) => {
    const spinner = ora('Validating database file...').start();

    try {
      const { JSONFilePreset } = await import('lowdb/node');
      const { validateDatabase, validateSemantics } = await import('./utils/validator');

      // Read database using lowdb
      const defaultData = {
        auth: [],
        repositories: [],
        tags: {},
        manifests: {},
        blobs: {},
      };
      const db = await JSONFilePreset(file, defaultData);

      validateDatabase(db.data);
      validateSemantics(db.data);

      spinner.succeed(chalk.green('Validation successful'));

      log(`
${chalk.cyan('Database Statistics:')}
  ${chalk.gray('Repositories:')} ${chalk.white(db.data.repositories?.length || 0)}
  ${chalk.gray('Total tags:')} ${chalk.white(Object.values(db.data.tags || {}).reduce((sum: number, tags: any) => sum + tags.length, 0))}
  ${chalk.gray('Manifests:')} ${chalk.white(Object.keys(db.data.manifests || {}).length)}
  ${chalk.gray('Blobs:')} ${chalk.white(Object.keys(db.data.blobs || {}).length)}`);

      process.exit(0);
    } catch (error) {
      spinner.fail(chalk.red('Validation failed'));

      if (error instanceof Error) {
        console.error(chalk.red(error.message));
      } else {
        console.error(error);
      }

      process.exit(1);
    }
  });

program.parse();
