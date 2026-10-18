FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY *.go ./
RUN go test ./... && CGO_ENABLED=0 go build -trimpath -o /mux .
FROM alpine:3.22
RUN apk add --no-cache ca-certificates
COPY --from=build /mux /usr/local/bin/nethernet-mux
USER 65534:65534
ENTRYPOINT ["nethernet-mux"]
