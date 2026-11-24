package main

import (
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"net/mail"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

const (
	sessionCookie = "roastlab_session"
	sessionTTL    = 24 * time.Hour
)

type profile struct {
	Name  string `json:"name"`
	Email string `json:"email"`
	Phone string `json:"phone,omitempty"`
}

type account struct {
	Profile   profile    `json:"profile"`
	Salt      []byte     `json:"salt"`
	Digest    []byte     `json:"digest"`
	ConsentAt *time.Time `json:"personalDataConsentAt,omitempty"`
}

type session struct {
	email   string
	expires time.Time
}

type accountStore struct {
	mu       sync.Mutex
	path     string
	accounts map[string]account
	sessions map[string]session
}

func openAccounts(path string) (*accountStore, error) {
	store := &accountStore{
		path: path, accounts: make(map[string]account), sessions: make(map[string]session),
	}
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return store, nil
	}
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(data, &store.accounts); err != nil {
		return nil, err
	}
	if store.accounts == nil {
		return nil, errors.New("invalid account data")
	}
	return store, nil
}

func (s *accountStore) save() error {
	if err := os.MkdirAll(filepath.Dir(s.path), 0700); err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(s.path), "accounts-*.tmp")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())

	if err := json.NewEncoder(file).Encode(s.accounts); err != nil {
		file.Close()
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	return os.Rename(file.Name(), s.path)
}

func (s *accountStore) routes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/account", s.current)
	mux.HandleFunc("POST /api/account/register", s.register)
	mux.HandleFunc("POST /api/account/login", s.login)
	mux.HandleFunc("POST /api/account/logout", s.logout)
}

type credentials struct {
	Name                string `json:"name"`
	Email               string `json:"email"`
	Password            string `json:"password"`
	Phone               string `json:"phone"`
	PersonalDataConsent bool   `json:"personalDataConsent"`
}

func readCredentials(w http.ResponseWriter, r *http.Request) (credentials, bool) {
	var input credentials
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil || decoder.Decode(new(any)) != io.EOF {
		accountError(w, http.StatusBadRequest, "Не удалось прочитать данные формы.")
		return input, false
	}
	input.Email = strings.ToLower(strings.TrimSpace(input.Email))
	input.Name = strings.TrimSpace(input.Name)
	input.Phone = strings.TrimSpace(input.Phone)
	return input, true
}

func normalizePhone(value string) (string, bool) {
	international := strings.HasPrefix(value, "+")
	var digits strings.Builder
	for i, char := range value {
		switch {
		case char >= '0' && char <= '9':
			digits.WriteRune(char)
		case char == '+' && i == 0:
		case strings.ContainsRune(" ()-\u00a0\u202f", char):
		default:
			return "", false
		}
	}
	number := digits.String()
	switch {
	case international && strings.HasPrefix(number, "7") && len(number) != 11:
		return "", false
	case international && len(number) >= 8 && len(number) <= 15 && number[0] != '0':
		return "+" + number, true
	case !international && len(number) == 10:
		return "+7" + number, true
	case !international && len(number) == 11 && (number[0] == '7' || number[0] == '8'):
		return "+7" + number[1:], true
	default:
		return "", false
	}
}

func accountError(w http.ResponseWriter, code int, message string) {
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, code, map[string]string{"error": message})
}

func passwordDigest(password string, salt []byte) ([]byte, error) {
	return pbkdf2.Key(sha256.New, password, salt, 600_000, 32)
}

func (s *accountStore) register(w http.ResponseWriter, r *http.Request) {
	input, ok := readCredentials(w, r)
	if !ok {
		return
	}
	address, err := mail.ParseAddress(input.Email)
	if err != nil || address.Address != input.Email || len(input.Email) > 254 {
		accountError(w, http.StatusBadRequest, "Введите корректный e-mail.")
		return
	}
	if n := utf8.RuneCountInString(input.Name); n < 2 || n > 80 {
		accountError(w, http.StatusBadRequest, "Имя должно содержать от 2 до 80 символов.")
		return
	}
	if utf8.RuneCountInString(input.Password) < 8 || len(input.Password) > 256 {
		accountError(w, http.StatusBadRequest, "Пароль должен содержать не менее 8 символов и занимать до 256 байт.")
		return
	}
	if input.Phone == "" {
		accountError(w, http.StatusBadRequest, "Укажите номер телефона.")
		return
	}
	phone, valid := normalizePhone(input.Phone)
	if !valid {
		accountError(w, http.StatusBadRequest, "Введите номер телефона с кодом страны, например +7 900 000-00-00.")
		return
	}
	if !input.PersonalDataConsent {
		accountError(w, http.StatusBadRequest, "Отметьте согласие на обработку персональных данных.")
		return
	}
	consentAt := time.Now().UTC()

	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		accountError(w, http.StatusInternalServerError, "Не удалось создать аккаунт.")
		return
	}
	digest, err := passwordDigest(input.Password, salt)
	if err != nil {
		accountError(w, http.StatusInternalServerError, "Не удалось создать аккаунт.")
		return
	}
	entry := account{
		Profile: profile{Name: input.Name, Email: input.Email, Phone: phone},
		Salt:    salt, Digest: digest, ConsentAt: &consentAt,
	}

	s.mu.Lock()
	if _, exists := s.accounts[input.Email]; exists {
		s.mu.Unlock()
		accountError(w, http.StatusConflict, "Аккаунт с таким e-mail уже существует.")
		return
	}
	s.accounts[input.Email] = entry
	err = s.save()
	if err != nil {
		delete(s.accounts, input.Email)
	}
	s.mu.Unlock()
	if err != nil {
		log.Printf("save accounts: %v", err)
		accountError(w, http.StatusInternalServerError, "Не удалось сохранить аккаунт.")
		return
	}
	s.startSession(w, r, entry.Profile, http.StatusCreated)
}

func (s *accountStore) login(w http.ResponseWriter, r *http.Request) {
	input, ok := readCredentials(w, r)
	if !ok {
		return
	}
	if len(input.Password) > 256 {
		accountError(w, http.StatusUnauthorized, "Неверный e-mail или пароль.")
		return
	}

	s.mu.Lock()
	entry, exists := s.accounts[input.Email]
	s.mu.Unlock()
	if !exists {
		entry.Salt = make([]byte, 16)
		entry.Digest = make([]byte, 32)
	}
	digest, err := passwordDigest(input.Password, entry.Salt)
	if err != nil || subtle.ConstantTimeCompare(digest, entry.Digest) != 1 || !exists {
		accountError(w, http.StatusUnauthorized, "Неверный e-mail или пароль.")
		return
	}
	s.startSession(w, r, entry.Profile, http.StatusOK)
}

func (s *accountStore) startSession(w http.ResponseWriter, r *http.Request, user profile, status int) {
	token := make([]byte, 32)
	if _, err := rand.Read(token); err != nil {
		accountError(w, http.StatusInternalServerError, "Не удалось открыть сессию. Попробуйте войти снова.")
		return
	}
	key := hex.EncodeToString(token)
	now := time.Now()

	s.mu.Lock()
	if cookie, err := r.Cookie(sessionCookie); err == nil {
		delete(s.sessions, cookie.Value)
	}
	for id, current := range s.sessions {
		if !current.expires.After(now) {
			delete(s.sessions, id)
		}
	}
	s.sessions[key] = session{email: user.Email, expires: now.Add(sessionTTL)}
	s.mu.Unlock()

	http.SetCookie(w, &http.Cookie{
		Name: sessionCookie, Value: key, Path: "/", HttpOnly: true,
		SameSite: http.SameSiteLaxMode, Secure: r.TLS != nil, MaxAge: int(sessionTTL.Seconds()),
	})
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, status, user)
}

func (s *accountStore) current(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	var user *profile
	if cookie, err := r.Cookie(sessionCookie); err == nil {
		s.mu.Lock()
		if current, ok := s.sessions[cookie.Value]; ok {
			if current.expires.After(time.Now()) {
				if entry, exists := s.accounts[current.email]; exists {
					user = &entry.Profile
				}
			} else {
				delete(s.sessions, cookie.Value)
			}
		}
		s.mu.Unlock()
	}
	writeJSON(w, http.StatusOK, struct {
		User *profile `json:"user"`
	}{User: user})
}

func (s *accountStore) logout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(sessionCookie); err == nil {
		s.mu.Lock()
		delete(s.sessions, cookie.Value)
		s.mu.Unlock()
	}
	http.SetCookie(w, &http.Cookie{
		Name: sessionCookie, Path: "/", HttpOnly: true,
		SameSite: http.SameSiteLaxMode, Secure: r.TLS != nil, MaxAge: -1,
	})
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusNoContent)
}
