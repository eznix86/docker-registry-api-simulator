import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, extname } from 'path';
import { load } from 'js-yaml';
import { parse as parseJsonc } from 'jsonc-parser';
import { createHash, randomUUID } from 'crypto';
import { validateDatabase, validateSemantics } from './validator';
import { faker } from '@faker-js/faker';

interface TemplateAuth {
  username: string;
  password: string;
}

interface TemplateRepository {
  name: string;
  tags: string[];
  format?: 'oci' | 'docker';
  multiarch?: boolean;
  architectures?: string[];
  os?: string;
}

interface Template {
  auth?: TemplateAuth[];
  repositories: TemplateRepository[];
}

interface DatabaseSchema {
  auth: TemplateAuth[];
  repositories: { name: string }[];
  tags: Record<string, { tag: string; digest: string }[]>;
  manifests: Record<string, any>;
  blobs: Record<string, any>;
}

function computeDigest(content: string): string {
  return 'sha256:' + createHash('sha256').update(content).digest('hex');
}

function generateRandomSize(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateLayerBlob(): { digest: string; size: number } {
  const size = generateRandomSize(1000000, 100000000); // 1MB to 100MB
  const randomData = `layer-${randomUUID()}-${size}`;
  const digest = computeDigest(randomData);
  return { digest, size };
}

function generateConfigBlob(arch: string, os: string, layerDigests: string[], repoName: string): any {
  // Random date within last 365 days
  const now = faker.date.recent({ days: 365 }).toISOString();

  // Create realistic history entries for each layer
  const history = layerDigests.map((digest, index) => {
    // Each layer is progressively older (working backward from image creation)
    const layerDate = faker.date.past({ years: 1, refDate: now }).toISOString();

    if (index === 0) {
      return {
        created: layerDate,
        created_by: `# ${os} base layer`,
        comment: 'buildkit.dockerfile.v0'
      };
    }

    const commands = [
      'RUN /bin/sh -c apt-get update && apt-get install -y --no-install-recommends',
      'COPY . /app',
      'RUN /bin/sh -c mkdir -p /app',
      'ENV NODE_VERSION=20.0.0',
      'WORKDIR /app'
    ];

    return {
      created: layerDate,
      created_by: commands[index % commands.length],
      comment: 'buildkit.dockerfile.v0',
      empty_layer: Math.random() > 0.7
    };
  });

  const version = faker.system.semver();
  const description = faker.lorem.sentence();

  const config = {
    architecture: arch,
    os: os,
    created: now,
    config: {
      Env: [
        'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        `APP_VERSION=${version}`,
        `APP_NAME=${repoName}`
      ],
      Cmd: ['/bin/sh', '-c', `${repoName}`],
      WorkingDir: '/app',
      Labels: {
        'org.opencontainers.image.created': now,
        'org.opencontainers.image.title': repoName,
        'org.opencontainers.image.description': description,
        'org.opencontainers.image.source': `https://github.com/${faker.internet.username()}/${repoName}`,
        'org.opencontainers.image.version': version,
        'org.opencontainers.image.licenses': faker.helpers.arrayElement(['Apache-2.0', 'MIT', 'BSD-3-Clause', 'GPL-3.0', 'ISC'])
      },
      StopSignal: 'SIGTERM'
    },
    rootfs: {
      type: 'layers',
      diff_ids: layerDigests
    },
    history
  };

  // Add optional fields for certain cases
  if (repoName === 'postgres' || repoName === 'redis' || repoName === 'nginx') {
    config.config.User = '999';
    config.config.ExposedPorts = {
      [`${repoName === 'postgres' ? '5432' : repoName === 'redis' ? '6379' : '80'}/tcp`]: {}
    };

    if (repoName === 'postgres') {
      config.config.Env.push('POSTGRES_VERSION=16', 'PGDATA=/var/lib/postgresql/data');
      config.config.Volumes = { '/var/lib/postgresql/data': {} };
      config.config.Entrypoint = ['docker-entrypoint.sh'];
      config.config.Cmd = ['postgres'];
    } else if (repoName === 'redis') {
      config.config.Env.push('REDIS_VERSION=7.2');
      config.config.Volumes = { '/data': {} };
      config.config.Cmd = ['redis-server'];
    } else if (repoName === 'nginx') {
      config.config.Env.push('NGINX_VERSION=1.25.3');
      config.config.Cmd = ['nginx', '-g', 'daemon off;'];
      config.config.StopSignal = 'SIGQUIT';
    }
  }

  return config;
}

function generateManifest(
  format: 'oci' | 'docker',
  configDigest: string,
  configSize: number,
  layers: Array<{ digest: string; size: number }>
): any {
  const mediaTypePrefix = format === 'oci'
    ? 'application/vnd.oci.image'
    : 'application/vnd.docker.distribution';

  return {
    schemaVersion: 2,
    mediaType: format === 'oci'
      ? `${mediaTypePrefix}.manifest.v1+json`
      : `${mediaTypePrefix}.manifest.v2+json`,
    config: {
      mediaType: format === 'oci'
        ? `${mediaTypePrefix}.config.v1+json`
        : 'application/vnd.docker.container.image.v1+json',
      digest: configDigest,
      size: configSize
    },
    layers: layers.map(layer => ({
      mediaType: format === 'oci'
        ? `${mediaTypePrefix}.layer.v1.tar+gzip`
        : 'application/vnd.docker.image.rootfs.diff.tar.gzip',
      digest: layer.digest,
      size: layer.size
    }))
  };
}

function generateManifestIndex(
  format: 'oci' | 'docker',
  platformManifests: Array<{ digest: string; size: number; arch: string; os: string }>
): any {
  const isOci = format === 'oci';

  return {
    schemaVersion: 2,
    mediaType: isOci
      ? 'application/vnd.oci.image.index.v1+json'
      : 'application/vnd.docker.distribution.manifest.list.v2+json',
    manifests: platformManifests.map(pm => ({
      mediaType: isOci
        ? 'application/vnd.oci.image.manifest.v1+json'
        : 'application/vnd.docker.distribution.manifest.v2+json',
      digest: pm.digest,
      size: pm.size,
      platform: {
        architecture: pm.arch,
        os: pm.os
      }
    }))
  };
}

function generateDatabase(template: Template): DatabaseSchema {
  const database: DatabaseSchema = {
    auth: template.auth || [],
    repositories: [],
    tags: {},
    manifests: {},
    blobs: {}
  };

  for (const repo of template.repositories) {
    const format = repo.format || 'oci';
    const os = repo.os || 'linux';
    const multiarch = repo.multiarch || false;
    const architectures = repo.architectures || ['amd64', 'arm64'];

    // Add repository
    database.repositories.push({ name: repo.name });
    database.tags[repo.name] = [];

    for (const tag of repo.tags) {
      if (multiarch) {
        // Generate multi-arch manifest (index/list)
        const platformManifests: Array<{ digest: string; size: number; arch: string; os: string }> = [];

        for (const arch of architectures) {
          // Generate layers for this platform
          const layerCount = generateRandomSize(1, 5);
          const layers: Array<{ digest: string; size: number }> = [];
          const layerDigests: string[] = [];

          for (let i = 0; i < layerCount; i++) {
            const layer = generateLayerBlob();
            layers.push(layer);
            layerDigests.push(layer.digest);
          }

          // Generate config blob
          const configBlob = generateConfigBlob(arch, os, layerDigests, repo.name);
          const configJson = JSON.stringify(configBlob);
          const configDigest = computeDigest(configJson);
          const configSize = Buffer.byteLength(configJson);

          // Store config blob
          database.blobs[configDigest] = configBlob;

          // Generate manifest for this platform
          const manifest = generateManifest(format, configDigest, configSize, layers);
          const manifestJson = JSON.stringify(manifest);
          const manifestDigest = computeDigest(manifestJson);
          const manifestSize = Buffer.byteLength(manifestJson);

          // Store manifest
          database.manifests[manifestDigest] = {
            type: format,
            data: manifest
          };

          platformManifests.push({
            digest: manifestDigest,
            size: manifestSize,
            arch,
            os
          });
        }

        // Generate manifest index/list
        const index = generateManifestIndex(format, platformManifests);
        const indexJson = JSON.stringify(index);
        const indexDigest = computeDigest(indexJson);

        // Store manifest index
        database.manifests[indexDigest] = {
          type: format === 'oci' ? 'oci-index' : 'docker-list',
          data: index
        };

        // Add tag pointing to index
        database.tags[repo.name].push({
          tag,
          digest: indexDigest
        });

      } else {
        // Generate single-arch manifest
        const arch = architectures[0] || 'amd64';

        // Generate layers
        const layerCount = generateRandomSize(1, 5);
        const layers: Array<{ digest: string; size: number }> = [];
        const layerDigests: string[] = [];

        for (let i = 0; i < layerCount; i++) {
          const layer = generateLayerBlob();
          layers.push(layer);
          layerDigests.push(layer.digest);
        }

        // Generate config blob
        const configBlob = generateConfigBlob(arch, os, layerDigests, repo.name);
        const configJson = JSON.stringify(configBlob);
        const configDigest = computeDigest(configJson);
        const configSize = Buffer.byteLength(configJson);

        // Store config blob
        database.blobs[configDigest] = configBlob;

        // Generate manifest
        const manifest = generateManifest(format, configDigest, configSize, layers);
        const manifestJson = JSON.stringify(manifest);
        const manifestDigest = computeDigest(manifestJson);

        // Store manifest
        database.manifests[manifestDigest] = {
          type: format,
          data: manifest
        };

        // Add tag
        database.tags[repo.name].push({
          tag,
          digest: manifestDigest
        });
      }
    }
  }

  return database;
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: bun run generator.ts <template.yaml|template.jsonc>');
    console.error('Example: bun run generator.ts templates/example.yaml');
    console.error('Example: bun run generator.ts templates/example.jsonc');
    process.exit(1);
  }

  const templatePath = resolve(args[0]);
  const fileExtension = extname(templatePath).toLowerCase();

  try {
    // Read and parse template (YAML or JSONC)
    console.log(`Reading template from: ${templatePath}`);
    const templateContent = readFileSync(templatePath, 'utf-8');

    let template: Template;
    if (fileExtension === '.json' || fileExtension === '.jsonc') {
      // Parse JSONC (JSON with comments)
      template = parseJsonc(templateContent) as Template;
    } else if (fileExtension === '.yaml' || fileExtension === '.yml') {
      // Parse YAML
      template = load(templateContent) as Template;
    } else {
      throw new Error(`Unsupported file format: ${fileExtension}. Use .yaml, .yml, .json, or .jsonc`);
    }

    // Validate template structure
    if (!template.repositories || !Array.isArray(template.repositories)) {
      throw new Error('Template must contain a "repositories" array');
    }

    console.log(`Generating database from template...`);
    console.log(`  Repositories: ${template.repositories.length}`);
    console.log(`  Authentication: ${template.auth ? 'enabled' : 'disabled'}`);

    // Generate database
    const database = generateDatabase(template);

    // Validate database
    console.log('\nValidating generated database...');
    validateDatabase(database);
    validateSemantics(database);

    // Generate output filename
    const uuid = randomUUID();
    const outputDir = resolve('data');
    const outputPath = resolve(outputDir, `${uuid}.json`);

    // Ensure data directory exists
    mkdirSync(outputDir, { recursive: true });

    // Write to file
    writeFileSync(outputPath, JSON.stringify(database, null, 2), 'utf-8');

    console.log(`\n✓ Successfully generated database!`);
    console.log(`  Output: ${outputPath}`);
    console.log(`  Repositories: ${database.repositories.length}`);
    console.log(`  Total tags: ${Object.values(database.tags).reduce((sum, tags) => sum + tags.length, 0)}`);
    console.log(`  Manifests: ${Object.keys(database.manifests).length}`);
    console.log(`  Blobs: ${Object.keys(database.blobs).length}`);

  } catch (error) {
    console.error('\n✗ Generation failed:');
    if (error instanceof Error) {
      console.error(`  ${error.message}`);
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

main();
