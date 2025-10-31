import type {
	ConfigBlob,
	DatabaseSchema,
	ManifestData,
	Template,
} from "~/types"
import { Buffer } from "node:buffer"
import { randomUUID } from "node:crypto"
import { mkdirSync, readFileSync } from "node:fs"
import { extname, resolve } from "node:path"
import { faker } from "@faker-js/faker"
import chalk from "chalk"
import { load } from "js-yaml"
import { parse as parseJsonc } from "jsonc-parser"
import { JSONFilePreset } from "lowdb/node"
import { DEFAULT_DATABASE } from "~/constants"
import { computeDigest } from "~/utils/crypto"
import { validateDatabase, validateSemantics, validateTemplate } from "~/utils/validator"

const log = console.log

function generateRandomSize(min: number, max: number): number {
	return Math.floor(Math.random() * (max - min + 1)) + min
}

function generateLayerBlob(): { digest: string, size: number } {
	const size = generateRandomSize(1000000, 100000000)
	const randomData = `layer-${randomUUID()}-${size}`
	const digest = computeDigest(randomData)
	return { digest, size }
}

function generateConfigBlob(
	arch: string,
	os: string,
	layerDigests: string[],
	repoName: string,
): ConfigBlob {
	const now = faker.date.recent({ days: 365 }).toISOString()

	const history = layerDigests.map((digest, index) => {
		const layerDate = faker.date.past({ years: 1, refDate: now }).toISOString()

		if (index === 0) {
			return {
				created: layerDate,
				created_by: `# ${os} base layer`,
				comment: "buildkit.dockerfile.v0",
			}
		}

		const commands = [
			"RUN /bin/sh -c apt-get update && apt-get install -y --no-install-recommends",
			"COPY . /app",
			"RUN /bin/sh -c mkdir -p /app",
			"ENV NODE_VERSION=20.0.0",
			"WORKDIR /app",
		]

		return {
			created: layerDate,
			created_by: commands[index % commands.length],
			comment: "buildkit.dockerfile.v0",
			empty_layer: Math.random() > 0.7,
		}
	})

	const version = faker.system.semver()
	const description = faker.lorem.sentence()

	const config: ConfigBlob = {
		architecture: arch,
		os,
		created: now,
		config: {
			Env: [
				"PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
				`APP_VERSION=${version}`,
				`APP_NAME=${repoName}`,
			],
			Cmd: ["/bin/sh", "-c", `${repoName}`],
			WorkingDir: "/app",
			Labels: {
				"org.opencontainers.image.created": now,
				"org.opencontainers.image.title": repoName,
				"org.opencontainers.image.description": description,
				"org.opencontainers.image.source": `https://github.com/${faker.internet.username()}/${repoName}`,
				"org.opencontainers.image.version": version,
				"org.opencontainers.image.licenses": faker.helpers.arrayElement([
					"Apache-2.0",
					"MIT",
					"BSD-3-Clause",
					"GPL-3.0",
					"ISC",
				]),
			},
			StopSignal: "SIGTERM",
		},
		rootfs: {
			type: "layers",
			diff_ids: layerDigests,
		},
		history,
	}

	if (repoName === "postgres" || repoName === "redis" || repoName === "nginx") {
		config.config.User = "999"
		config.config.ExposedPorts = {
			[`${repoName === "postgres" ? "5432" : repoName === "redis" ? "6379" : "80"}/tcp`]:
        {},
		}

		if (repoName === "postgres") {
			config.config.Env = [
				...(config.config.Env ?? []),
				"POSTGRES_VERSION=16",
				"PGDATA=/var/lib/postgresql/data",
			]
			config.config.Volumes = { "/var/lib/postgresql/data": {} }
			config.config.Entrypoint = ["docker-entrypoint.sh"]
			config.config.Cmd = ["postgres"]
		}
		else if (repoName === "redis") {
			config.config.Env = [...(config.config.Env ?? []), "REDIS_VERSION=7.2"]
			config.config.Volumes = { "/data": {} }
			config.config.Cmd = ["redis-server"]
		}
		else if (repoName === "nginx") {
			config.config.Env = [
				...(config.config.Env ?? []),
				"NGINX_VERSION=1.25.3",
			]
			config.config.Cmd = ["nginx", "-g", "daemon off;"]
			config.config.StopSignal = "SIGQUIT"
		}
	}

	return config
}

function generateManifest(
	format: "oci" | "docker",
	configDigest: string,
	configSize: number,
	layers: Array<{ digest: string, size: number }>,
): ManifestData {
	const mediaTypePrefix
		= format === "oci"
			? "application/vnd.oci.image"
			: "application/vnd.docker.distribution"

	return {
		schemaVersion: 2,
		mediaType:
			format === "oci"
				? `${mediaTypePrefix}.manifest.v1+json`
				: `${mediaTypePrefix}.manifest.v2+json`,
		config: {
			mediaType:
				format === "oci"
					? `${mediaTypePrefix}.config.v1+json`
					: "application/vnd.docker.container.image.v1+json",
			digest: configDigest,
			size: configSize,
		},
		layers: layers.map(layer => ({
			mediaType:
				format === "oci"
					? `${mediaTypePrefix}.layer.v1.tar+gzip`
					: "application/vnd.docker.image.rootfs.diff.tar.gzip",
			digest: layer.digest,
			size: layer.size,
		})),
	}
}

function generateManifestIndex(
	format: "oci" | "docker",
	platformManifests: Array<{
		digest: string
		size: number
		arch: string
		os: string
	}>,
): ManifestData {
	const isOci = format === "oci"

	return {
		schemaVersion: 2,
		mediaType: isOci
			? "application/vnd.oci.image.index.v1+json"
			: "application/vnd.docker.distribution.manifest.list.v2+json",
		manifests: platformManifests.map(pm => ({
			mediaType: isOci
				? "application/vnd.oci.image.manifest.v1+json"
				: "application/vnd.docker.distribution.manifest.v2+json",
			digest: pm.digest,
			size: pm.size,
			platform: {
				architecture: pm.arch,
				os: pm.os,
			},
		})),
	}
}

export async function generateDatabase(
	template: Template,
	db: any,
): Promise<void> {
	db.data.auth = template.auth || []

	for (const repo of template.repositories) {
		const format = repo.format || "oci"
		const os = repo.os || "linux"
		const multiarch = repo.multiarch || false
		const architectures = repo.architectures || ["amd64", "arm64"]

		db.data.repositories.push({ name: repo.name })
		db.data.tags[repo.name] = []

		for (const tag of repo.tags) {
			if (multiarch) {
				const platformManifests: Array<{
					digest: string
					size: number
					arch: string
					os: string
				}> = []

				for (const arch of architectures) {
					const layerCount = generateRandomSize(1, 5)
					const layers: Array<{ digest: string, size: number }> = []
					const layerDigests: string[] = []

					for (let i = 0; i < layerCount; i++) {
						const layer = generateLayerBlob()
						layers.push(layer)
						layerDigests.push(layer.digest)
					}

					const configBlob = generateConfigBlob(
						arch,
						os,
						layerDigests,
						repo.name,
					)
					const configJson = JSON.stringify(configBlob)
					const configDigest = computeDigest(configJson)
					const configSize = Buffer.byteLength(configJson)

					db.data.blobs[configDigest] = configBlob

					const manifest = generateManifest(
						format,
						configDigest,
						configSize,
						layers,
					)
					const manifestJson = JSON.stringify(manifest)
					const manifestDigest = computeDigest(manifestJson)
					const manifestSize = Buffer.byteLength(manifestJson)

					db.data.manifests[manifestDigest] = {
						type: format,
						data: manifest,
					}

					platformManifests.push({
						digest: manifestDigest,
						size: manifestSize,
						arch,
						os,
					})
				}

				const index = generateManifestIndex(format, platformManifests)
				const indexJson = JSON.stringify(index)
				const indexDigest = computeDigest(indexJson)

				db.data.manifests[indexDigest] = {
					type: format === "oci" ? "oci-index" : "docker-list",
					data: index,
				}

				db.data.tags[repo.name]!.push({
					tag,
					digest: indexDigest,
				})
			}
			else {
				const arch = architectures[0] || "amd64"

				const layerCount = generateRandomSize(1, 5)
				const layers: Array<{ digest: string, size: number }> = []
				const layerDigests: string[] = []

				for (let i = 0; i < layerCount; i++) {
					const layer = generateLayerBlob()
					layers.push(layer)
					layerDigests.push(layer.digest)
				}

				const configBlob = generateConfigBlob(
					arch,
					os,
					layerDigests,
					repo.name,
				)
				const configJson = JSON.stringify(configBlob)
				const configDigest = computeDigest(configJson)
				const configSize = Buffer.byteLength(configJson)

				db.data.blobs[configDigest] = configBlob

				const manifest = generateManifest(
					format,
					configDigest,
					configSize,
					layers,
				)
				const manifestJson = JSON.stringify(manifest)
				const manifestDigest = computeDigest(manifestJson)

				db.data.manifests[manifestDigest] = {
					type: format,
					data: manifest,
				}

				db.data.tags[repo.name]!.push({
					tag,
					digest: manifestDigest,
				})
			}
		}
	}

	await db.write()
}

export async function generateDatabaseFromTemplate(
	templatePath: string,
	outputPath?: string,
): Promise<string> {
	const fullTemplatePath = resolve(templatePath)
	const fileExtension = extname(fullTemplatePath).toLowerCase()

	log(
		`${chalk.blue("Reading template from:")} ${chalk.cyan(fullTemplatePath)}`,
	)
	const templateContent = readFileSync(fullTemplatePath, "utf-8")

	let template: Template
	if (fileExtension === ".json" || fileExtension === ".jsonc") {
		template = parseJsonc(templateContent) as Template
	}
	else if (fileExtension === ".yaml" || fileExtension === ".yml") {
		template = load(templateContent) as Template
	}
	else {
		throw new Error(
			`Unsupported file format: ${fileExtension}. Use .yaml, .yml, .json, or .jsonc`,
		)
	}

	// Validate template against JSON schema
	log(`
${chalk.blue("Validating template...")}`)
	validateTemplate(template)

	log(`
${chalk.blue("Generating database from template...")}
  ${chalk.gray("Repositories:")} ${chalk.white(template.repositories.length)}
  ${chalk.gray("Authentication:")} ${chalk.white(template.auth ? "enabled" : "disabled")}`)

	let finalOutputPath: string
	if (outputPath) {
		finalOutputPath = resolve(outputPath)
	}
	else {
		const uuid = randomUUID()
		const outputDir = resolve("data")
		finalOutputPath = resolve(outputDir, `${uuid}.json`)
	}

	const outputDir = finalOutputPath.substring(0, finalOutputPath.lastIndexOf("/"))
	mkdirSync(outputDir, { recursive: true })

	const db = await JSONFilePreset<DatabaseSchema>(finalOutputPath, DEFAULT_DATABASE)

	await generateDatabase(template, db)

	log(`
${chalk.blue("Validating generated database...")}`)
	validateDatabase(db.data)
	validateSemantics(db.data)

	log(`
${chalk.green("Successfully generated database!")}
  ${chalk.gray("Output:")} ${chalk.cyan(finalOutputPath)}
  ${chalk.gray("Repositories:")} ${chalk.white(db.data.repositories.length)}
  ${chalk.gray("Total tags:")} ${chalk.white(Object.values(db.data.tags).reduce((sum, tags) => sum + tags.length, 0))}
  ${chalk.gray("Manifests:")} ${chalk.white(Object.keys(db.data.manifests).length)}
  ${chalk.gray("Blobs:")} ${chalk.white(Object.keys(db.data.blobs).length)}`)

	return finalOutputPath
}
