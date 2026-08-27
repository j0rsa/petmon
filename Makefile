.PHONY: help build-be build-fe run-be run-dev-fe install-fe story seed-demo check check-fe check-be check-shortcut kill-be-port build-shortcut publish-shortcut shortcut

FE_DIR := frontend
BE_PORT ?= 8080

help:
	@echo "Targets:"
	@echo "  make build-be     Build the Rust backend"
	@echo "  make build-fe     Build the frontend (output: frontend/dist/)"
	@echo "  make run-be       Free port $(BE_PORT) and run the backend server"
	@echo "  make kill-be-port Stop whatever is listening on port $(BE_PORT)"
	@echo "  make run-dev-fe   Run the frontend dev server (Vite)"
	@echo "  make story        Run the Storybook component server"
	@echo "  make seed-demo    Reset DB and load demo data (ARGS='--append' to skip wipe)"
	@echo "  make install-fe   Install frontend npm dependencies"
	@echo "  make check        Run all checks (fe + be + shortcut)"
	@echo "  make check-fe     Typecheck, lint, and test the frontend"
	@echo "  make check-be     Format, clippy, audit, and test the backend"
	@echo "  make check-shortcut  Compile shortcuts/med-intake.cherri and verify the plist"
	@echo "  make build-shortcut  Compile + sign the med-intake Apple Shortcut (macOS)"
	@echo "  make publish-shortcut  Build, open in Shortcuts, print iCloud publish steps"
	@echo "  make shortcut  Build/sign, open Shortcuts, prompt for iCloud URL → publish.json"

install-fe:
	cd $(FE_DIR) && npm install

build-be:
	cargo build

build-fe: install-fe
	cd $(FE_DIR) && npm run build

kill-be-port:
	@pids=$$(lsof -ti tcp:$(BE_PORT) -sTCP:LISTEN 2>/dev/null); \
	if [ -n "$$pids" ]; then \
		echo "Killing listener(s) on port $(BE_PORT): $$pids"; \
		kill $$pids 2>/dev/null || kill -9 $$pids; \
		sleep 0.3; \
	else \
		echo "Port $(BE_PORT) is free"; \
	fi

run-be: kill-be-port
	DEV_MODE=true STATIC_DIR=frontend/dist cargo run

seed-demo:
	cargo run --bin seed-demo -- $(ARGS)

run-dev-fe: install-fe
	cd $(FE_DIR) && npm run dev

story: install-fe
	cd $(FE_DIR) && npm run storybook

check: check-fe check-be check-shortcut

check-fe: install-fe
	cd $(FE_DIR) && npx tsc --noEmit
	cd $(FE_DIR) && npm run lint
	cd $(FE_DIR) && npx playwright install chromium --with-deps
	cd $(FE_DIR) && npx vitest run

check-be:
	cargo fmt --check
	DATABASE_URL="sqlite::memory:" cargo clippy --locked -- -D warnings

	DATABASE_URL="sqlite::memory:" cargo test --locked

# Compile the Cherri source and verify the plist it produces. Needs the Cherri
# compiler v2.3.0 (v2+ can't be installed via go install due to module path;
# download from https://github.com/electrikmilk/cherri/releases/tag/v2.3.0);
# no macOS, no server required.
check-shortcut:
	python3 shortcuts/build.py --check

# Same, plus signing — macOS only, and it rewrites the committed .shortcut.
build-shortcut:
	python3 shortcuts/build.py

publish-shortcut:
	python3 shortcuts/publish.py

# Build, sign, open Shortcuts, then record the iCloud link in publish.json.
shortcut:
	python3 shortcuts/publish.py --await-url

