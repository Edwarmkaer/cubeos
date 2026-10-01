// A disposable verification proxy: browser resource requests are restricted to
// the local origin by CSP, even when the host browser itself has Internet.
// Run with: go run infra/docker/offline-browser-proxy.go http://127.0.0.1:3103
package main

import (
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"time"
)

func main() {
	if len(os.Args) != 2 {
		log.Fatal("usage: offline-browser-proxy http://127.0.0.1:<web-port>")
	}
	target, err := url.Parse(os.Args[1])
	if err != nil || target.Scheme != "http" || target.Hostname() != "127.0.0.1" || target.Port() == "" {
		log.Fatal("target must be local loopback http with an explicit port")
	}
	proxy := httputil.NewSingleHostReverseProxy(target)
	proxy.ModifyResponse = func(response *http.Response) error {
		// Inline hydration/styles and local blob workers are needed by Next/MapLibre.
		// No remote script/font/image/connect/media/frame origin is permitted.
		response.Header.Set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'self'")
		response.Header.Set("X-CubeOS-Offline-Probe", "browser-resources-local-only")
		return nil
	}
	server := &http.Server{Addr: "127.0.0.1:3104", Handler: proxy, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second}
	log.Print("offline browser probe: http://127.0.0.1:3104/visor")
	log.Fatal(server.ListenAndServe())
}
