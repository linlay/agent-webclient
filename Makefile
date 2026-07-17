ifeq ($(OS),Windows_NT)
VERSION :=
ARCH ?= amd64
else
VERSION := $(shell cat VERSION 2>/dev/null || echo "dev")
ARCH ?= $(shell uname -m | sed 's/x86_64/amd64/' | sed 's/aarch64/arm64/')
endif
COMPOSE_FILE ?= compose.yml
PASS_PROGRAM_TARGETS = $(if $(filter undefined,$(origin PROGRAM_TARGETS)),,PROGRAM_TARGETS=$(PROGRAM_TARGETS))
PASS_PROGRAM_TARGET_MATRIX = $(if $(filter undefined,$(origin PROGRAM_TARGET_MATRIX)),,PROGRAM_TARGET_MATRIX=$(PROGRAM_TARGET_MATRIX))

.PHONY: install dev build build-web test docker-build docker-up docker-down release release-program release-image

install:
	npm install

dev:
	npm start

build:
	$(MAKE) build-web

build-web:
	npm run build

test:
	npm run check:boundaries
	npm test

docker-build:
	docker compose -f $(COMPOSE_FILE) build

docker-up:
	docker compose -f $(COMPOSE_FILE) up -d --build

docker-down:
	docker compose -f $(COMPOSE_FILE) down

release:
	$(MAKE) release-program VERSION=$(VERSION) ARCH=$(ARCH) $(PASS_PROGRAM_TARGETS) $(PASS_PROGRAM_TARGET_MATRIX)

ifeq ($(OS),Windows_NT)
release-program:
	powershell -NoProfile -ExecutionPolicy Bypass -File scripts/release-program.ps1 -Version "$(VERSION)" -Arch "$(ARCH)"
else
release-program:
	VERSION=$(VERSION) ARCH=$(ARCH) $(PASS_PROGRAM_TARGETS) $(PASS_PROGRAM_TARGET_MATRIX) bash scripts/release-program.sh
endif

release-image:
	VERSION=$(VERSION) ARCH=$(ARCH) bash scripts/release-image.sh
