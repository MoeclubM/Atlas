.PHONY: help build-web build-probe build-frontend build run-web run-probe clean docker-build docker-up docker-down test dev-frontend

help:
	@echo "Atlas - Global Network Testing Platform"
	@echo ""
	@echo "Available targets:"
	@echo "  build-web       - Build web server"
	@echo "  build-probe     - Build probe client"
	@echo "  build-frontend  - Build Vue.js frontend"
	@echo "  build           - Build web, probe and frontend"
	@echo "  dev-frontend    - Start frontend dev server"
	@echo "  run-web         - Run web server"
	@echo "  run-probe       - Run probe client"
	@echo "  test            - Run tests"
	@echo "  clean           - Clean build artifacts"
	@echo "  docker-build    - Build Docker images"
	@echo "  docker-up       - Start Docker Compose services"
	@echo "  docker-down     - Stop Docker Compose services"

build-web:
	@echo "Building web server..."
	cd web && go build -o ../atlas-server cmd/server/main.go

build-probe:
	@echo "Building probe client..."
	cd probe && go build -o ../atlas-probe cmd/probe/main.go

build-frontend:
	@echo "Building Vue.js frontend..."
	cd frontend && npm ci && npm run build

build: build-web build-probe build-frontend
	@echo "Build complete!"

run-web:
	@echo "Running web server..."
	cd web && go run cmd/server/main.go

run-probe:
	@echo "Running probe client..."
	cd probe && go run cmd/probe/main.go

test:
	@echo "Running web tests..."
	cd web && go test ./...
	@echo "Running probe tests..."
	cd probe && go test ./...

clean:
	@echo "Cleaning build artifacts..."
	rm -f atlas-server atlas-probe
	rm -rf data/ logs/

docker-build:
	@echo "Building Docker images..."
	docker compose build

docker-up:
	@echo "Starting Docker services..."
	docker compose up -d

docker-down:
	@echo "Stopping Docker services..."
	docker compose down

docker-logs:
	docker compose logs -f

# Development helpers
dev-web:
	@echo "Starting web server in development mode..."
	cd web && go run cmd/server/main.go

dev-probe:
	@echo "Starting probe in development mode..."
	cd probe && go run cmd/probe/main.go

dev-frontend:
	@echo "Starting frontend dev server..."
	cd frontend && npm run dev

# Installation helpers
install-web:
	@echo "Installing web server to /usr/local/bin..."
	go build -o atlas-server web/cmd/server/main.go
	sudo mv atlas-server /usr/local/bin/

install-probe:
	@echo "Installing probe to /usr/local/bin..."
	go build -o atlas-probe probe/cmd/probe/main.go
	sudo mv atlas-probe /usr/local/bin/

# Database management
db-migrate:
	@echo "Running database migrations..."
	cd web && go run cmd/server/main.go migrate

db-backup:
	@echo "Backing up database..."
	mkdir -p backups
	cp data/atlas.db backups/atlas_$(shell date +%Y%m%d_%H%M%S).db

# Dependencies
deps:
	@echo "Downloading dependencies..."
	cd web && go mod download
	cd probe && go mod download
