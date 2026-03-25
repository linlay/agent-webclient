VERSION := $(shell cat VERSION 2>/dev/null || echo "dev")
ARCH := $(shell uname -m | sed 's/x86_64/amd64/' | sed 's/aarch64/arm64/')
COMPOSE_FILE ?= compose.yml

.PHONY: install dev build test docker-build docker-up docker-down release

install:
	npm install

dev:
	npm start

build:
	npm run build

test:
	npm test

docker-build:
	docker compose -f $(COMPOSE_FILE) build

docker-up:
	docker compose -f $(COMPOSE_FILE) up -d --build

docker-down:
	docker compose -f $(COMPOSE_FILE) down

release:
	VERSION=$(VERSION) ARCH=$(ARCH) bash scripts/release.sh
