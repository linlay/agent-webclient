.PHONY: install dev build test docker-build docker-up docker-down

install:
	npm install

dev:
	npm start

build:
	npm run build

test:
	npm test

docker-build:
	docker compose build

docker-up:
	docker compose up -d --build

docker-down:
	docker compose down
