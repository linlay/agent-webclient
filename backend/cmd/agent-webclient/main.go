package main

import (
	"errors"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type config struct {
	port         string
	baseURL      *url.URL
	voiceBaseURL *url.URL
	frontendDist string
	indexFile    string
}

func main() {
	cfg, err := loadConfig()
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	server := &http.Server{
		Addr:              ":" + cfg.port,
		Handler:           newHandler(cfg),
		ReadHeaderTimeout: 10 * time.Second,
	}

	log.Printf("agent-webclient listening on %s", server.Addr)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("listen: %v", err)
	}
}

func loadConfig() (config, error) {
	cwd, err := os.Getwd()
	if err != nil {
		return config{}, err
	}

	baseRaw := strings.TrimSpace(os.Getenv("BASE_URL"))
	if baseRaw == "" {
		baseRaw = "http://127.0.0.1:11949"
	}
	voiceRaw := strings.TrimSpace(os.Getenv("VOICE_BASE_URL"))
	if voiceRaw == "" {
		voiceRaw = baseRaw
	}

	baseURL, err := url.Parse(baseRaw)
	if err != nil {
		return config{}, err
	}
	voiceBaseURL, err := url.Parse(voiceRaw)
	if err != nil {
		return config{}, err
	}

	frontendDist := filepath.Join(cwd, "frontend", "dist")
	indexFile := filepath.Join(frontendDist, "index.html")
	if _, err := os.Stat(indexFile); err != nil {
		return config{}, err
	}

	port := strings.TrimSpace(os.Getenv("PORT"))
	if port == "" {
		port = "11948"
	}

	return config{
		port:         port,
		baseURL:      baseURL,
		voiceBaseURL: voiceBaseURL,
		frontendDist: frontendDist,
		indexFile:    indexFile,
	}, nil
}

func newHandler(cfg config) http.Handler {
	baseProxy := newReverseProxy(cfg.baseURL)
	voiceProxy := newReverseProxy(cfg.voiceBaseURL)

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasPrefix(r.URL.Path, "/api/voice"):
			voiceProxy.ServeHTTP(w, r)
		case strings.HasPrefix(r.URL.Path, "/api"):
			baseProxy.ServeHTTP(w, r)
		default:
			serveFrontend(cfg, w, r)
		}
	})
}

func newReverseProxy(target *url.URL) *httputil.ReverseProxy {
	proxy := httputil.NewSingleHostReverseProxy(target)
	proxy.FlushInterval = -1
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		if req.URL.Path == "/api/query" {
			req.Header.Del("Accept-Encoding")
		}
	}
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		log.Printf("reverse proxy %s %s failed: %v", r.Method, r.URL.Path, err)
		http.Error(w, "upstream unavailable", http.StatusBadGateway)
	}
	return proxy
}

func serveFrontend(cfg config, w http.ResponseWriter, r *http.Request) {
	cleanPath := filepath.Clean("/" + strings.TrimPrefix(r.URL.Path, "/"))
	if cleanPath == "/" {
		http.ServeFile(w, r, cfg.indexFile)
		return
	}

	assetPath := filepath.Join(cfg.frontendDist, strings.TrimPrefix(cleanPath, "/"))
	info, err := os.Stat(assetPath)
	switch {
	case err == nil && !info.IsDir():
		http.ServeFile(w, r, assetPath)
		return
	case err == nil && info.IsDir():
		indexPath := filepath.Join(assetPath, "index.html")
		if _, statErr := os.Stat(indexPath); statErr == nil {
			http.ServeFile(w, r, indexPath)
			return
		}
	case !os.IsNotExist(err):
		http.Error(w, "failed to read asset", http.StatusInternalServerError)
		return
	}

	if filepath.Ext(cleanPath) != "" {
		http.NotFound(w, r)
		return
	}

	http.ServeFile(w, r, cfg.indexFile)
}
