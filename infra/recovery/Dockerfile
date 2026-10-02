FROM golang:1.27.1-alpine AS build
WORKDIR /src
COPY apps/api/go.mod apps/api/go.sum ./
RUN go mod download
COPY apps/api/ ./
RUN CGO_ENABLED=0 go build -trimpath -o /recovery ./cmd/recovery

# Use the exact PostgreSQL major/version used by the installation and CI dump.
FROM postgres:17.6-alpine
COPY --from=build /recovery /usr/local/bin/recovery
USER 10001:10001
ENTRYPOINT ["recovery"]
