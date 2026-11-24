package main

import (
	"embed"
	"encoding/json"
	"flag"
	"io/fs"
	"log"
	"net/http"
	"net/mail"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"
)

//go:embed *.html css images js lighthouse api/products.json
var site embed.FS

type product struct {
	ID          string `json:"id"`
	Category    string `json:"category"`
	Price       int    `json:"price"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Image       string `json:"image"`
	Alt         string `json:"alt"`
	Badge       string `json:"badge"`
	Href        string `json:"href"`
}

func main() {
	address := flag.String("addr", "127.0.0.1:8080", "HTTP listen address")
	accountsPath := flag.String("accounts", ".roastlab/accounts.json", "local account data file")
	flag.Parse()

	data, err := site.ReadFile("api/products.json")
	if err != nil {
		log.Fatal(err)
	}
	var products []product
	if err := json.Unmarshal(data, &products); err != nil {
		log.Fatalf("read catalog: %v", err)
	}

	accounts, err := openAccounts(*accountsPath)
	if err != nil {
		log.Fatalf("open accounts: %v", err)
	}

	server := &http.Server{
		Addr:              *address,
		Handler:           http.NewCrossOriginProtection().Handler(shopHandler(products, accounts)),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       30 * time.Second,
	}
	log.Printf("RoastLab: http://%s", *address)
	log.Fatal(server.ListenAndServe())
}

func shopHandler(products []product, accounts *accountStore) http.Handler {
	mux := http.NewServeMux()
	accounts.routes(mux)
	mux.HandleFunc("POST /api/feedback", feedbackHandler(filepath.Join(filepath.Dir(accounts.path), "feedback")))
	list := func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, products)
	}
	mux.HandleFunc("GET /api/products", list)
	mux.HandleFunc("GET /api/products.json", list)
	mux.HandleFunc("GET /api/products/{id}", func(w http.ResponseWriter, r *http.Request) {
		for _, item := range products {
			if item.ID == r.PathValue("id") {
				writeJSON(w, http.StatusOK, item)
				return
			}
		}
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "product not found"})
	})

	files := http.FileServerFS(site)
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			info, err := fs.Stat(site, strings.TrimPrefix(r.URL.Path, "/"))
			if err != nil || info.IsDir() {
				http.NotFound(w, r)
				return
			}
		}
		files.ServeHTTP(w, r)
	})
	return mux
}

func feedbackHandler(directory string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
		if err := r.ParseForm(); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Не удалось прочитать данные обращения."})
			return
		}
		entry := struct {
			Name       string    `json:"name"`
			Email      string    `json:"email"`
			Message    string    `json:"message"`
			ReceivedAt time.Time `json:"receivedAt"`
		}{
			Name:       strings.TrimSpace(r.PostForm.Get("name")),
			Email:      strings.TrimSpace(r.PostForm.Get("email")),
			Message:    strings.TrimSpace(r.PostForm.Get("message")),
			ReceivedAt: time.Now().UTC(),
		}
		email, err := mail.ParseAddress(entry.Email)
		if entry.Name == "" || utf8.RuneCountInString(entry.Name) > 80 ||
			err != nil || email.Address != entry.Email || len(entry.Email) > 254 ||
			entry.Message == "" || utf8.RuneCountInString(entry.Message) > 3000 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Проверьте имя, e-mail и текст обращения."})
			return
		}
		if err := saveFeedback(directory, entry); err != nil {
			log.Printf("save feedback: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Не удалось сохранить обращение. Попробуйте ещё раз."})
			return
		}
		writeJSON(w, http.StatusCreated, map[string]bool{"received": true})
	}
}

func saveFeedback(directory string, entry any) error {
	if err := os.MkdirAll(directory, 0700); err != nil {
		return err
	}
	file, err := os.CreateTemp(directory, "feedback-*.tmp")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	encodeErr := json.NewEncoder(file).Encode(entry)
	closeErr := file.Close()
	if encodeErr != nil {
		return encodeErr
	}
	if closeErr != nil {
		return closeErr
	}
	return os.Rename(file.Name(), strings.TrimSuffix(file.Name(), ".tmp")+".json")
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		log.Printf("write API response: %v", err)
	}
}
