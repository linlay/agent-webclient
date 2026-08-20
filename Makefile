ifeq ($(OS),Windows_NT)
VERSION :=
ARCH ?= amd64
else
VERSION := $(shell cat VERSION 2>/dev/null || echo "dev")
ARCH ?= $(shell uname -m | sed 's/x86_64/amd64/' | sed 's/aarch64/arm64/')
endif
PASS_PROGRAM_TARGETS = $(if $(filter undefined,$(origin PROGRAM_TARGETS)),,PROGRAM_TARGETS=$(PROGRAM_TARGETS))
PASS_PROGRAM_TARGET_MATRIX = $(if $(filter undefined,$(origin PROGRAM_TARGET_MATRIX)),,PROGRAM_TARGET_MATRIX=$(PROGRAM_TARGET_MATRIX))

.PHONY: install dev build build-web test test-program-deploy release release-program

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

test-program-deploy:
	bash scripts/test-program-deploy.sh

release:
	$(MAKE) release-program VERSION=$(VERSION) ARCH=$(ARCH) $(PASS_PROGRAM_TARGETS) $(PASS_PROGRAM_TARGET_MATRIX)

ifeq ($(OS),Windows_NT)
release-program:
	powershell -NoProfile -ExecutionPolicy Bypass -File scripts/release-program.ps1 -Version "$(VERSION)" -Arch "$(ARCH)"
else
release-program:
	VERSION=$(VERSION) ARCH=$(ARCH) $(PASS_PROGRAM_TARGETS) $(PASS_PROGRAM_TARGET_MATRIX) bash scripts/release-program.sh
endif
