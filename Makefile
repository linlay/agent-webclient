VERSION := $(shell cat VERSION 2>/dev/null || echo "dev")
ARCH := $(shell uname -m | sed 's/x86_64/amd64/' | sed 's/aarch64/arm64/')
COMPOSE_FILE ?= compose.yml
PASS_PROGRAM_TARGETS = $(if $(filter undefined,$(origin PROGRAM_TARGETS)),,PROGRAM_TARGETS=$(PROGRAM_TARGETS))
PASS_PROGRAM_TARGET_MATRIX = $(if $(filter undefined,$(origin PROGRAM_TARGET_MATRIX)),,PROGRAM_TARGET_MATRIX=$(PROGRAM_TARGET_MATRIX))

.PHONY: install dev build build-web build-backend test docker-build docker-up docker-down release release-program release-image

install:
	npm install

dev:
	npm start

build:
	$(MAKE) build-web
	$(MAKE) build-backend

build-web:
	npm run build

build-backend:
	mkdir -p bin
	cd backend && CGO_ENABLED=0 go build -o ../bin/agent-webclient ./cmd/agent-webclient

test:
	npm test

docker-build:
	docker compose -f $(COMPOSE_FILE) build

docker-up:
	docker compose -f $(COMPOSE_FILE) up -d --build

docker-down:
	docker compose -f $(COMPOSE_FILE) down

release:
	$(MAKE) release-program VERSION=$(VERSION) ARCH=$(ARCH) $(PASS_PROGRAM_TARGETS) $(PASS_PROGRAM_TARGET_MATRIX)

release-program:
	VERSION=$(VERSION) ARCH=$(ARCH) $(PASS_PROGRAM_TARGETS) $(PASS_PROGRAM_TARGET_MATRIX) bash scripts/release-program.sh

release-image:
	VERSION=$(VERSION) ARCH=$(ARCH) bash scripts/release-image.sh
