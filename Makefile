.PHONY: help build-be build-fe run-be run-dev-fe install-fe story seed-demo check check-fe check-be check-shortcut check-shortcut-publish test-shortcut sim-shortcut shortcut-engine-test kill-be-port build-med-intake-shortcut publish-med-intake-shortcut shortcut build-med-intake-automate publish-med-intake-automate automate

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
	@echo "  make check-shortcut  Validate the shortcut plist and run its tests (no macOS needed)"
	@echo "  make check-shortcut-publish  Check the iCloud link against the committed shortcut logic"
	@echo "  make sim-shortcut ARGS='--pet <uuid> --key <token>'  Run the shortcut logic against a live server"
	@echo "  make shortcut-engine-test ARGS='--pet <uuid> --key <token>'  Build the no-tap harness for the real Shortcuts app"
	@echo "  make build-med-intake-shortcut  Build/sign the med-intake Apple Shortcut (macOS)"
	@echo "  make publish-med-intake-shortcut  Build, open in Shortcuts, print iCloud publish steps"
	@echo "  make shortcut  Build/sign, open Shortcuts, prompt for iCloud URL → publish.json"
	@echo "  make build-med-intake-automate  Bootstrap or validate AutoMate .flo"
	@echo "  make publish-med-intake-automate  Print Automate Community publish steps"
	@echo "  make automate  Prompt for Automate Community URL → publish.json"

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

# Tier 1: structure + behaviour of the generated plist. No macOS, no server.
check-shortcut: test-shortcut
	python3 scripts/build-med-intake-shortcut.py --validate-only

test-shortcut:
	python3 -m unittest discover -s scripts/tests

# Release check: does the published iCloud link still match the committed logic?
# Not part of `make check` — clearing it needs the manual Apple share flow.
check-shortcut-publish:
	python3 scripts/build-med-intake-shortcut.py --check-publish

# Tier 2: the same plist, real HTTP against a running Petmon.
#   make sim-shortcut ARGS="--pet <uuid> --key <api token> --dry-run"
sim-shortcut:
	python3 scripts/simulate-med-intake-shortcut.py $(ARGS)

# Tier 3: a no-tap variant for the real Shortcuts engine. Import it once by
# double-clicking the file, then `shortcuts run "Petmon Take Meds (Test)"`.
shortcut-engine-test:
	python3 scripts/build-med-intake-shortcut.py --harness $(ARGS)

build-med-intake-shortcut:
	python3 scripts/build-med-intake-shortcut.py

publish-med-intake-shortcut:
	python3 scripts/publish-med-intake-shortcut.py

shortcut:
	python3 scripts/publish-med-intake-shortcut.py --await-url

build-med-intake-automate:
	python3 scripts/build-med-intake-automate.py --check

publish-med-intake-automate:
	python3 scripts/publish-med-intake-automate.py

automate:
	python3 scripts/publish-med-intake-automate.py --await-url
