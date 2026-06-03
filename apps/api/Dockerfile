FROM golang:1.25-alpine AS build

WORKDIR /app
COPY apps/api/go.mod ./go.mod
COPY apps/api ./
RUN go build -o /out/pulse-api ./cmd/api

FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata
RUN adduser -D -H pulse
USER pulse
WORKDIR /app
COPY --from=build /out/pulse-api /app/pulse-api

EXPOSE 8080
CMD ["/app/pulse-api"]
