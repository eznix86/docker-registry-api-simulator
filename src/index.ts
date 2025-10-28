#!/usr/bin/env bun
import { Command } from 'commander';
import { spawn } from 'child_process';
import { resolve } from 'path';
import ora from 'ora';
import chalk from 'chalk';

const log = console.log;
const program = new Command();

program
  .name('registry-simulator')
  .description('Docker Registry API v2 simulator')
  .version('1.0.0');

program
  .command('serve')
  .description('Start the Docker Registry API v2 simulator server')
  .option('-f, --db-file <path>', 'Path to the database JSON file', 'db.json')
  .option('-p, --port <number>', 'Port to listen on', '5001')
  .action((options) => {
    log(`${chalk.blue('Starting server with database:')} ${chalk.cyan(options.dbFile)}`);

    const env = {
      ...process.env,
      DB_FILE: options.dbFile,
      PORT: options.port.toString()
    };

    const child = spawn('bun', ['run', resolve(__dirname, '../server.ts')], {
      env,
      stdio: 'inherit'
    });

    child.on('exit', (code) => process.exit(code || 0));
  });

program
  .command('generate')
  .description('Generate a database from a template file')
  .argument('<template>', 'Path to template file (YAML or JSONC)')
  .action((template) => {
    const spinner = ora('Generating database from template...').start();

    const child = spawn('bun', ['run', resolve(__dirname, '../generator.ts'), template], {
      stdio: 'pipe'
    });

    let output = '';

    child.stdout?.on('data', (data) => {
      output += data.toString();
    });

    child.stderr?.on('data', (data) => {
      output += data.toString();
    });

    child.on('exit', (code) => {
      if (code === 0) {
        spinner.succeed(chalk.green('Database generated successfully'));
        log(output);
      } else {
        spinner.fail(chalk.red('Generation failed'));
        console.error(output);
        process.exit(code || 1);
      }
    });
  });

program
  .command('validate')
  .description('Validate a database JSON file')
  .argument('<file>', 'Path to database JSON file to validate')
  .action(async (file) => {
    const spinner = ora('Validating database file...').start();

    try {
      const { readFileSync } = await import('fs');
      const { validateDatabase, validateSemantics } = await import('./utils/validator');

      const data = JSON.parse(readFileSync(file, 'utf-8'));

      validateDatabase(data);
      validateSemantics(data);

      spinner.succeed(chalk.green('Validation successful'));

      log(`
${chalk.cyan('Database Statistics:')}
  ${chalk.gray('Repositories:')} ${chalk.white(data.repositories?.length || 0)}
  ${chalk.gray('Total tags:')} ${chalk.white(Object.values(data.tags || {}).reduce((sum: number, tags: any) => sum + tags.length, 0))}
  ${chalk.gray('Manifests:')} ${chalk.white(Object.keys(data.manifests || {}).length)}
  ${chalk.gray('Blobs:')} ${chalk.white(Object.keys(data.blobs || {}).length)}`);

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
