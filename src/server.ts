import type { DatabaseSchema, Manifest, Template } from "~/types"
import { Buffer } from "node:buffer"
import process from "node:process"
import { swagger } from "@elysiajs/swagger"
import chalk from "chalk"
import { Elysia, t } from "elysia"
import logixlysia from "logixlysia"
import { JSONFilePreset } from "lowdb/node"
import { DEFAULT_DATABASE, DOCKER_DISTRIBUTION_API_VERSION } from "~/constants"
import { generateDatabase } from "~/generator"
import { computeDigest } from "~/utils/crypto"
import { validateDatabase, validateSemantics } from "~/utils/validator"

const log = console.log

function buildLinkHeader(baseUrl: string, n: number, last: string): string {
	return `<${baseUrl}?n=${n}&last=${last}>; rel="next"`
}

function selectManifestFormat(
	accept: string,
	manifestEntry: Manifest,
): { manifest: any, contentType: string } | null {
	const acceptTypes = new Set(accept.split(",").map(t => t.trim()))

	const typeToMediaType: Record<string, string> = {
		"oci-index": "application/vnd.oci.image.index.v1+json",
		"docker-list": "application/vnd.docker.distribution.manifest.list.v2+json",
		"oci": "application/vnd.oci.image.manifest.v1+json",
		"docker": "application/vnd.docker.distribution.manifest.v2+json",
	}

	const contentType = typeToMediaType[manifestEntry.type]

	if (contentType && acceptTypes.has(contentType)) {
		return {
			manifest: manifestEntry.data,
			contentType,
		}
	}

	// For testing: allow OCI/Docker format interchangeability (real registries have separate digests)
	if (
		(manifestEntry.type === "oci" || manifestEntry.type === "docker")
		&& contentType
	) {
		const singleArchTypes = [
			"application/vnd.oci.image.manifest.v1+json",
			"application/vnd.docker.distribution.manifest.v2+json",
		]

		for (const mediaType of singleArchTypes) {
			if (acceptTypes.has(mediaType)) {
				// Transform the manifest data to match the requested media type
				const transformedManifest = { ...manifestEntry.data, mediaType }
				return {
					manifest: transformedManifest,
					contentType: mediaType,
				}
			}
		}
	}

	// Fallback: For multi-arch manifests, accept either OCI index or Docker list interchangeably
	if (
		(manifestEntry.type === "oci-index"
			|| manifestEntry.type === "docker-list")
		&& contentType
	) {
		const multiArchTypes = [
			"application/vnd.oci.image.index.v1+json",
			"application/vnd.docker.distribution.manifest.list.v2+json",
		]

		for (const mediaType of multiArchTypes) {
			if (acceptTypes.has(mediaType)) {
				// Transform the manifest data to match the requested media type
				const transformedManifest = { ...manifestEntry.data, mediaType }
				return {
					manifest: transformedManifest,
					contentType: mediaType,
				}
			}
		}
	}

	return null
}

function registryError(code: string, message: string, status = 404) {
	return new Response(JSON.stringify({ errors: [{ code, message }] }), {
		status,
		headers: {
			"Content-Type": "application/json",
			"Docker-Distribution-API-Version": DOCKER_DISTRIBUTION_API_VERSION,
		},
	})
}

function findOrphanedBlobs(manifests: Record<string, Manifest>): Set<string> {
	const referencedBlobs = new Set<string>()

	// Collect all config digests from all manifests
	for (const manifestEntry of Object.values(manifests)) {
		if (manifestEntry.data.config?.digest) {
			referencedBlobs.add(manifestEntry.data.config.digest)
		}
	}

	return referencedBlobs
}

export async function createServer(dbFile: string, port: number, throttle = 0) {
	const db = await JSONFilePreset<DatabaseSchema>(dbFile, DEFAULT_DATABASE)

	log(`${chalk.blue("Loaded database from:")} ${chalk.cyan(dbFile)}`)

	// Validate database structure and semantics
	validateDatabase(db.data)
	validateSemantics(db.data)

	log(
		`${chalk.blue("Authentication:")} ${chalk.cyan(db.data.auth && db.data.auth.length > 0 ? "enabled" : "disabled")}`,
	)

	if (throttle > 0) {
		log(
			`${chalk.blue("Throttle:")} ${chalk.cyan(`${throttle}ms delay per request`)}`,
		)
	}

	// Helper functions that need access to db
	function checkBasicAuth(authHeader: string | undefined): boolean {
		if (!db.data.auth || db.data.auth.length === 0) {
			return true
		}

		if (!authHeader || !authHeader.startsWith("Basic ")) {
			return false
		}

		const base64Credentials = authHeader.slice(6)
		const credentials = Buffer.from(base64Credentials, "base64").toString(
			"utf-8",
		)
		const [username, password] = credentials.split(":")

		return db.data.auth.some(
			user => user.username === username && user.password === password,
		)
	}

	function unauthorizedResponse() {
		return new Response(
			JSON.stringify({
				errors: [{ code: "UNAUTHORIZED", message: "authentication required" }],
			}),
			{
				status: 401,
				headers: {
					"Content-Type": "application/json",
					"Docker-Distribution-API-Version": DOCKER_DISTRIBUTION_API_VERSION,
					"WWW-Authenticate": "Basic realm=\"Docker Registry\"",
				},
			},
		)
	}

	const app = new Elysia()
		.use(
			swagger({
				documentation: {
					info: {
						title: "Docker Registry API v2 Simulator",
						version: "1.0.0",
						description:
              "A Docker Registry HTTP API v2 simulator for testing and development",
					},
					tags: [
						{ name: "health", description: "Health check endpoints" },
						{ name: "catalog", description: "Repository catalog" },
						{ name: "tags", description: "Tag management" },
						{ name: "manifests", description: "Manifest operations" },
						{
							name: "blobs",
							description: "Blob operations (config blobs only)",
						},
					],
				},
			}),
		)
		.use(
			logixlysia({
				config: {
					showStartupMessage: true,
					startupMessageFormat: "simple",
					timestamp: {
						translateTime: "yyyy-mm-dd HH:MM:ss.SSS",
					},
					ip: true,
					customLogFormat:
            "{now} {level} {duration} {method} {pathname} {status} {message} {ip}",
				},
			}),
		)

		.onBeforeHandle(({ set, headers, request }) => {
			set.headers["Docker-Distribution-API-Version"] = DOCKER_DISTRIBUTION_API_VERSION

			const url = new URL(request.url)
			if (
				url.pathname !== "/v2/"
				&& url.pathname !== "/swagger"
				&& !url.pathname.startsWith("/swagger/")
			) {
				if (throttle > 0) {
					Bun.sleepSync(throttle)
				}

				if (!checkBasicAuth(headers.authorization)) {
					return unauthorizedResponse()
				}
			}
		})

		.get("/v2/", () => ({}), {
			detail: {
				summary: "API version check",
				description: "Check if registry supports v2 API",
				tags: ["health"],
			},
		})

		.get(
			"/v2/_catalog",
			({ query, set }) => {
				const n = query.n ? Number.parseInt(query.n as string) : undefined
				const last = query.last

				if (n !== undefined && (Number.isNaN(n) || n <= 0)) {
					return registryError(
						"PAGINATION_NUMBER_INVALID",
						"Invalid value for n parameter",
						400,
					)
				}

				let repos = db.data.repositories.map(r => r.name).sort()

				if (last) {
					const index = repos.indexOf(last)
					if (index !== -1)
						repos = repos.slice(index + 1)
				}

				let hasMore = false
				if (n !== undefined && repos.length > n) {
					repos = repos.slice(0, n)
					hasMore = true
				}

				if (hasMore && repos.length > 0) {
					set.headers.Link = buildLinkHeader(
						"/v2/_catalog",
						n!,
						repos[repos.length - 1]!,
					)
				}

				return { repositories: repos }
			},
			{
				query: t.Object({
					n: t.Optional(t.String()),
					last: t.Optional(t.String()),
				}),
				detail: {
					summary: "List repositories",
					description: "Retrieve a sorted, paginated list of repositories",
					tags: ["catalog"],
				},
			},
		)

	// 3. Tags list with pagination
		.get(
			"/v2/:name/tags/list",
			({ params, query, set }) => {
				const { name } = params
				const n = query.n ? Number.parseInt(query.n as string) : undefined
				const last = query.last

				// Check repository exists
				const repoExists = db.data.repositories.some(r => r.name === name)
				if (!repoExists) {
					return registryError("NAME_UNKNOWN", "repository not found", 404)
				}

				if (n !== undefined && (Number.isNaN(n) || n <= 0)) {
					return registryError(
						"PAGINATION_NUMBER_INVALID",
						"Invalid value for n parameter",
						400,
					)
				}

				let tags = (db.data.tags[name] || []).map(t => t.tag).sort()

				// Apply cursor
				if (last) {
					const index = tags.indexOf(last)
					if (index !== -1)
						tags = tags.slice(index + 1)
				}

				// Apply pagination
				let hasMore = false
				if (n !== undefined && tags.length > n) {
					tags = tags.slice(0, n)
					hasMore = true
				}

				// Add Link header
				if (hasMore && tags.length > 0) {
					set.headers.Link = buildLinkHeader(
						`/v2/${name}/tags/list`,
						n!,
						tags[tags.length - 1]!,
					)
				}

				return { name, tags }
			},
			{
				params: t.Object({
					name: t.String(),
				}),
				query: t.Object({
					n: t.Optional(t.String()),
					last: t.Optional(t.String()),
				}),
				detail: {
					summary: "List tags for repository",
					description:
            "Retrieve a sorted, paginated list of tags for a repository",
					tags: ["tags"],
				},
			},
		)

		.get(
			"/v2/:name/manifests/:reference",
			({ params, headers, set }) => {
				const { name, reference } = params
				const accept
					= headers.accept
						|| "application/vnd.docker.distribution.manifest.v2+json"
				const ifNoneMatch = headers["if-none-match"]

				const repoExists = db.data.repositories.some(r => r.name === name)
				if (!repoExists) {
					return registryError("NAME_UNKNOWN", "repository not found", 404)
				}

				// Resolve reference to digest
				let digest = reference
				if (!reference.startsWith("sha256:")) {
					const tagEntry = (db.data.tags[name] || []).find(
						(t: any) => t.tag === reference,
					)
					if (!tagEntry) {
						return registryError("MANIFEST_UNKNOWN", "manifest not found", 404)
					}
					digest = tagEntry.digest
				}

				const manifestEntry = db.data.manifests[digest]
				if (!manifestEntry) {
					return registryError("MANIFEST_UNKNOWN", "manifest not found", 404)
				}

				// Content negotiation
				const selected = selectManifestFormat(accept, manifestEntry)
				if (!selected) {
					return registryError(
						"UNSUPPORTED",
						"requested media type not supported or not available",
						406,
					)
				}

				const { manifest, contentType } = selected

				const manifestJson = JSON.stringify(manifest)
				const manifestDigest = computeDigest(manifestJson)
				const etag = `"${manifestDigest}"`

				// Handle If-None-Match
				if (ifNoneMatch && ifNoneMatch === etag) {
					return new Response(null, {
						status: 304,
						headers: {
							"Docker-Distribution-API-Version": DOCKER_DISTRIBUTION_API_VERSION,
						},
					})
				}

				set.headers["Content-Type"] = contentType
				set.headers["Docker-Content-Digest"] = digest
				set.headers.ETag = etag

				return manifest
			},
			{
				params: t.Object({
					name: t.String(),
					reference: t.String(),
				}),
				detail: {
					summary: "Get manifest",
					description:
            "Retrieve manifest by tag or digest with content negotiation",
					tags: ["manifests"],
				},
			},
		)

		.head(
			"/v2/:name/manifests/:reference",
			({ params, headers, set }) => {
				const { name, reference } = params
				const accept
					= headers.accept
						|| "application/vnd.docker.distribution.manifest.v2+json"

				const repoExists = db.data.repositories.some(r => r.name === name)
				if (!repoExists) {
					return registryError("NAME_UNKNOWN", "repository not found", 404)
				}

				let digest = reference
				if (!reference.startsWith("sha256:")) {
					const tagEntry = (db.data.tags[name] || []).find(
						(t: any) => t.tag === reference,
					)
					if (!tagEntry) {
						return registryError("MANIFEST_UNKNOWN", "manifest not found", 404)
					}
					digest = tagEntry.digest
				}

				const manifestEntry = db.data.manifests[digest]
				if (!manifestEntry) {
					return registryError("MANIFEST_UNKNOWN", "manifest not found", 404)
				}

				// Content negotiation
				const selected = selectManifestFormat(accept, manifestEntry)
				if (!selected) {
					return registryError(
						"UNSUPPORTED",
						"requested media type not supported or not available",
						406,
					)
				}

				const { manifest, contentType } = selected

				const manifestJson = JSON.stringify(manifest)
				const manifestDigest = computeDigest(manifestJson)
				const etag = `"${manifestDigest}"`

				set.headers["Content-Type"] = contentType
				set.headers["Docker-Content-Digest"] = digest
				set.headers.ETag = etag
				set.headers["Content-Length"]
					= Buffer.byteLength(manifestJson).toString()

				return new Response(null, { status: 200 })
			},
			{
				params: t.Object({
					name: t.String(),
					reference: t.String(),
				}),
				detail: {
					summary: "Check manifest existence",
					description: "Check if manifest exists and get metadata",
					tags: ["manifests"],
				},
			},
		)

	// Config blobs only
		.get(
			"/v2/:name/blobs/:digest",
			({ params, set }) => {
				const { name, digest } = params

				const repoExists = db.data.repositories.some(r => r.name === name)
				if (!repoExists) {
					return registryError("NAME_UNKNOWN", "repository not found", 404)
				}

				if (!digest.startsWith("sha256:")) {
					return registryError("DIGEST_INVALID", "invalid digest format", 400)
				}

				const blob = db.data.blobs[digest]
				if (!blob) {
					return registryError("BLOB_UNKNOWN", "blob not found", 404)
				}

				const blobJson = JSON.stringify(blob)

				set.headers["Content-Type"] = "application/octet-stream"
				set.headers["Docker-Content-Digest"] = digest
				set.headers["Content-Length"] = Buffer.byteLength(blobJson).toString()

				return new Response(blobJson)
			},
			{
				params: t.Object({
					name: t.String(),
					digest: t.String(),
				}),
				detail: {
					summary: "Get blob",
					description:
            "Retrieve config blob by digest (layer blobs not supported)",
					tags: ["blobs"],
				},
			},
		)

	// Blob HEAD (config blobs only)
		.head(
			"/v2/:name/blobs/:digest",
			({ params, set }) => {
				const { name, digest } = params

				// Check repository exists
				const repoExists = db.data.repositories.some(r => r.name === name)
				if (!repoExists) {
					return registryError("NAME_UNKNOWN", "repository not found", 404)
				}

				// Validate digest format
				if (!digest.startsWith("sha256:")) {
					return registryError("DIGEST_INVALID", "invalid digest format", 400)
				}

				// Get blob
				const blob = db.data.blobs[digest]
				if (!blob) {
					return registryError("BLOB_UNKNOWN", "blob not found", 404)
				}

				const blobJson = JSON.stringify(blob)

				set.headers["Content-Type"] = "application/octet-stream"
				set.headers["Docker-Content-Digest"] = digest
				set.headers["Content-Length"] = Buffer.byteLength(blobJson).toString()

				return new Response(null, { status: 200 })
			},
			{
				params: t.Object({
					name: t.String(),
					digest: t.String(),
				}),
				detail: {
					summary: "Check blob existence",
					description: "Check if config blob exists and get metadata",
					tags: ["blobs"],
				},
			},
		)

		.post(
			"/v2/push",
			async ({ body, set }) => {
				try {
					await generateDatabase(body as Template, db)
					await db.write()

					set.status = 201
					return {
						message: "Successfully added repositories to registry",
					}
				}
				catch (error) {
					return registryError(
						"INVALID_REQUEST",
						error instanceof Error ? error.message : "Invalid request",
						400,
					)
				}
			},
			{
				body: t.Object({
					repositories: t.Array(
						t.Object({
							name: t.String(),
							tags: t.Array(t.String()),
							format: t.Optional(
								t.Union([t.Literal("oci"), t.Literal("docker")]),
							),
							multiarch: t.Optional(t.Boolean()),
							architectures: t.Optional(t.Array(t.String())),
							os: t.Optional(t.String()),
						}),
					),
				}),
				detail: {
					summary: "Push new repositories",
					description:
            "Add new repositories, tags, manifests, and blobs to the registry",
					tags: ["catalog"],
				},
			},
		)

		.delete(
			"/v2/:name/manifests/:reference",
			async ({ params, headers, set }) => {
				const { name, reference } = params
				const accept
					= headers.accept
						|| "application/vnd.docker.distribution.manifest.v2+json"

				const repoExists = db.data.repositories.some(r => r.name === name)
				if (!repoExists) {
					return registryError("NAME_UNKNOWN", "repository not found", 404)
				}

				// Resolve reference to digest
				let digest = reference
				if (!reference.startsWith("sha256:")) {
					const tagEntry = (db.data.tags[name] || []).find(
						(t: any) => t.tag === reference,
					)
					if (!tagEntry) {
						return registryError("MANIFEST_UNKNOWN", "manifest not found", 404)
					}
					digest = tagEntry.digest
				}

				const manifestEntry = db.data.manifests[digest]
				if (!manifestEntry) {
					return registryError("MANIFEST_UNKNOWN", "manifest not found", 404)
				}

				const selected = selectManifestFormat(accept, manifestEntry)
				if (!selected) {
					return registryError(
						"UNSUPPORTED",
						"requested media type not supported or not available",
						406,
					)
				}

				delete db.data.manifests[digest]

				if (db.data.tags[name]) {
					db.data.tags[name] = db.data.tags[name]!.filter(
						t => t.digest !== digest,
					)
				}

				const referencedBlobs = findOrphanedBlobs(db.data.manifests)
				const allBlobs = Object.keys(db.data.blobs)
				for (const blobDigest of allBlobs) {
					if (!referencedBlobs.has(blobDigest)) {
						delete db.data.blobs[blobDigest]
					}
				}

				await db.write()

				set.status = 202
				return new Response(null, { status: 202 })
			},
			{
				params: t.Object({
					name: t.String(),
					reference: t.String(),
				}),
				detail: {
					summary: "Delete manifest",
					description:
            "Delete manifest or manifest list by tag or digest. Automatically cleans up orphaned blobs.",
					tags: ["manifests"],
				},
			},
		)

	return {
		start() {
			app.listen(port)

			log(`
${chalk.green("Docker Registry API simulator running")}
  ${chalk.gray("Server:")} ${chalk.cyan(`http://localhost:${app.server?.port}`)}
  ${chalk.gray("Swagger:")} ${chalk.cyan(`http://localhost:${app.server?.port}/swagger`)}
  ${chalk.gray("Health:")} ${chalk.cyan(`http://localhost:${app.server?.port}/v2/`)}`)

			const gracefulShutdown = (signal: string) => {
				log(`
${chalk.yellow(`Received ${signal}, shutting down gracefully...`)}`)
				app.server?.stop()
				log(`${chalk.green("Server closed")}`)
				process.exit(0)
			}

			process.on("SIGTERM", () => gracefulShutdown("SIGTERM"))
			process.on("SIGINT", () => gracefulShutdown("SIGINT"))

			return app
		},
	}
}
