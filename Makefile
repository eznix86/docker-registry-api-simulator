
.PHONY: $(wildcard *)

up: compose/up
compose/up: kill-bun
	docker compose build --no-cache
	docker compose up -d

down: compose/down
compose/down:
	docker compose down

stop: compose/stop
compose/stop:
	docker compose stop

test: hurl/test
hurl/test: kill-bun
	@echo "Starting test server..."
	@bun run serve -f data/db.json > /tmp/simulator.log 2>&1 & echo $$! > /tmp/simulator.pid
	@sleep 3
	@echo "Running hurl tests..."
	@hurl --test tests/*.hurl; \
	EXIT_CODE=$$?; \
	echo "Stopping test server..."; \
	kill $$(cat /tmp/simulator.pid) 2>/dev/null || true; \
	rm -f /tmp/simulator.pid; \
	exit $$EXIT_CODE

kill-bun:
	@pkill -9 bun 2>/dev/null || true

lint:
	bunx eslint --fix

build:
	bun run build

validate:
	bun run validate data/db.json

validate-all:
	@echo "Validating all database files..."
	@for db in data/*.json; do \
		echo "Validating $$db..."; \
		bun run validate $$db || exit 1; \
	done
	@echo "All database files validated successfully!"

generate:
	bun run generate templates/example.jsonc

clean:
	rm -rf dist node_modules

install:
	bun install

dev:
	bun run serve

help:
	@echo "Available targets:"
	@echo "  up           - Build and start docker compose services"
	@echo "  down         - Stop and remove docker compose services"
	@echo "  stop         - Stop docker compose services"
	@echo "  test         - Run hurl tests"
	@echo "  kill-bun     - Kill all bun processes"
	@echo "  lint         - Run eslint with auto-fix"
	@echo "  build        - Build the project"
	@echo "  validate     - Validate data/db.json"
	@echo "  validate-all - Validate all database files"
	@echo "  generate     - Generate database from example template"
	@echo "  clean        - Remove build artifacts"
	@echo "  install      - Install dependencies"
	@echo "  dev          - Start development server"
	@echo "  help         - Show this help message"
