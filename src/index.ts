#!/usr/bin/env bun
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { spawn } from 'child_process';
import { resolve } from 'path';

yargs(hideBin(process.argv))
  .scriptName('registry-simulator')
  .command(
    'serve',
    'Start the Docker Registry API v2 simulator server',
    (yargs) => {
      return yargs
        .option('db-file', {
          alias: 'f',
          type: 'string',
          description: 'Path to the database JSON file',
          default: 'db.json'
        })
        .option('port', {
          alias: 'p',
          type: 'number',
          description: 'Port to listen on',
          default: 5001
        });
    },
    (argv) => {
      console.log(`Starting server with database: ${argv.dbFile}`);
      const env = {
        ...process.env,
        DB_FILE: argv.dbFile,
        PORT: argv.port.toString()
      };
      const child = spawn('bun', ['run', resolve(__dirname, '../server.ts')], {
        env,
        stdio: 'inherit'
      });
      child.on('exit', (code) => process.exit(code || 0));
    }
  )
  .command(
    'generate <template>',
    'Generate a database from a template file',
    (yargs) => {
      return yargs
        .positional('template', {
          type: 'string',
          description: 'Path to template file (YAML or JSONC)',
          demandOption: true
        });
    },
    (argv) => {
      console.log(`Generating database from template: ${argv.template}`);
      const child = spawn('bun', ['run', resolve(__dirname, '../generator.ts'), argv.template], {
        stdio: 'inherit'
      });
      child.on('exit', (code) => process.exit(code || 0));
    }
  )
  .command(
    'validate <file>',
    'Validate a database JSON file',
    (yargs) => {
      return yargs
        .positional('file', {
          type: 'string',
          description: 'Path to database JSON file to validate',
          demandOption: true
        });
    },
    async (argv) => {
      try {
        const { readFileSync } = await import('fs');
        const { validateDatabase, validateSemantics } = await import('./utils/validator');

        console.log(`Validating database file: ${argv.file}`);
        const data = JSON.parse(readFileSync(argv.file, 'utf-8'));

        validateDatabase(data);
        validateSemantics(data);

        console.log('\n✓ Validation successful!');
        console.log(`  Repositories: ${data.repositories?.length || 0}`);
        console.log(`  Total tags: ${Object.values(data.tags || {}).reduce((sum: number, tags: any) => sum + tags.length, 0)}`);
        console.log(`  Manifests: ${Object.keys(data.manifests || {}).length}`);
        console.log(`  Blobs: ${Object.keys(data.blobs || {}).length}`);
        process.exit(0);
      } catch (error) {
        console.error('\n✗ Validation failed:');
        if (error instanceof Error) {
          console.error(`  ${error.message}`);
        } else {
          console.error(error);
        }
        process.exit(1);
      }
    }
  )
  .demandCommand(1, 'You must specify a command')
  .help()
  .alias('h', 'help')
  .version('1.0.0')
  .alias('v', 'version')
  .parse();
