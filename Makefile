.PHONY: help build-be build-fe run-be run-dev-fe install-fe story seed-demo

FE_DIR := frontend

help:
	@echo "Targets:"
	@echo "  make build-be     Build the Rust backend"
	@echo "  make build-fe     Build the frontend (output: frontend/dist/)"
	@echo "  make run-be       Run the backend server (cargo run)"
	@echo "  make run-dev-fe   Run the frontend dev server (Vite)"
	@echo "  make story        Run the Storybook component server"
	@echo "  make seed-demo    Reset DB and load demo data (ARGS='--append' to skip wipe)"
	@echo "  make install-fe   Install frontend npm dependencies"

install-fe:
	cd $(FE_DIR) && npm install

build-be:
	cargo build

build-fe: install-fe
	cd $(FE_DIR) && npm run build

run-be:
	DEV_MODE=true STATIC_DIR=frontend/dist cargo run

seed-demo:
	cargo run --bin seed-demo -- $(ARGS)

run-dev-fe: install-fe
	cd $(FE_DIR) && npm run dev

story: install-fe
	cd $(FE_DIR) && npm run storybook
