package gui

import (
	"context"
	"html/template"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"bridgeai-proxy/internal/model"
)

type Store interface {
	ListProviders(context.Context) ([]model.Provider, error)
	SaveProvider(context.Context, *model.Provider) (int64, error)
	SetActiveProvider(context.Context, int64) error
}

type Server struct {
	store Store
	tpl   *template.Template
}

func New(store Store) *Server {
	return &Server{
		store: store,
		tpl:   template.Must(template.New("index").Parse(indexTemplate)),
	}
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch {
	case r.URL.Path == "/" && r.Method == http.MethodGet:
		s.handleIndex(w, r)
	case r.URL.Path == "/providers" && r.Method == http.MethodPost:
		s.handleSaveProvider(w, r)
	case strings.HasPrefix(r.URL.Path, "/providers/") && strings.HasSuffix(r.URL.Path, "/activate") && r.Method == http.MethodPost:
		s.handleActivateProvider(w, r)
	default:
		http.NotFound(w, r)
	}
}

func (s *Server) handleIndex(w http.ResponseWriter, r *http.Request) {
	providers, err := s.store.ListProviders(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	_ = s.tpl.Execute(w, map[string]any{"Providers": providers})
}

func (s *Server) handleSaveProvider(w http.ResponseWriter, r *http.Request) {
	if !isLocalOrigin(r) {
		http.Error(w, "invalid origin", http.StatusForbidden)
		return
	}
	if err := r.ParseForm(); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	protocol := model.Protocol(r.FormValue("protocol"))
	if protocol != model.ProtocolOpenAI && protocol != model.ProtocolAnthropic {
		http.Error(w, "invalid protocol", http.StatusBadRequest)
		return
	}
	p := &model.Provider{
		Name:     strings.TrimSpace(r.FormValue("name")),
		BaseURL:  strings.TrimSpace(r.FormValue("base_url")),
		APIKey:   strings.TrimSpace(r.FormValue("api_key")),
		Model:    strings.TrimSpace(r.FormValue("model")),
		Protocol: protocol,
	}
	if p.Name == "" || p.BaseURL == "" || p.Model == "" {
		http.Error(w, "missing required fields", http.StatusBadRequest)
		return
	}
	parsedURL, err := url.ParseRequestURI(p.BaseURL)
	if err != nil || parsedURL.Host == "" || (parsedURL.Scheme != "http" && parsedURL.Scheme != "https") || (parsedURL.Path != "" && parsedURL.Path != "/") || parsedURL.RawQuery != "" || parsedURL.Fragment != "" {
		http.Error(w, "base_url must be an http(s) root URL without path, query, or fragment", http.StatusBadRequest)
		return
	}
	id, err := s.store.SaveProvider(r.Context(), p)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if r.FormValue("activate") == "on" {
		if err := s.store.SetActiveProvider(r.Context(), id); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}
	http.Redirect(w, r, "/", http.StatusSeeOther)
}

func (s *Server) handleActivateProvider(w http.ResponseWriter, r *http.Request) {
	if !isLocalOrigin(r) {
		http.Error(w, "invalid origin", http.StatusForbidden)
		return
	}
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) != 3 {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}
	id, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := s.store.SetActiveProvider(r.Context(), id); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	http.Redirect(w, r, "/", http.StatusSeeOther)
}

func isLocalOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	parsed, err := url.Parse(origin)
	if err != nil {
		return false
	}
	return parsed.Host == r.Host
}

const indexTemplate = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>BridgeAI Proxy</title>
  <style>
    body { font-family: sans-serif; margin: 24px; max-width: 960px; }
    table { border-collapse: collapse; width: 100%; margin-top: 16px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    form { display: grid; gap: 8px; max-width: 560px; }
    input, select { padding: 8px; }
    .active { font-weight: bold; color: #0a7; }
  </style>
</head>
<body>
  <h1>BridgeAI Proxy</h1>
  <h2>新增 provider</h2>
  <form method="post" action="/providers">
    <input name="name" placeholder="名称" required>
    <input name="base_url" placeholder="API 地址，例如 http://127.0.0.1:11434" required>
    <input name="api_key" placeholder="API Key">
    <input name="model" placeholder="模型 ID" required>
    <select name="protocol">
      <option value="openai">OpenAI-compatible</option>
      <option value="anthropic">Anthropic-compatible</option>
    </select>
    <label><input type="checkbox" name="activate"> 保存后设为当前启用</label>
    <button type="submit">保存</button>
  </form>

  <h2>Providers</h2>
  <table>
    <thead>
      <tr><th>ID</th><th>名称</th><th>地址</th><th>模型</th><th>协议</th><th>状态</th><th>操作</th></tr>
    </thead>
    <tbody>
      {{range .Providers}}
      <tr>
        <td>{{.ID}}</td>
        <td>{{.Name}}</td>
        <td>{{.BaseURL}}</td>
        <td>{{.Model}}</td>
        <td>{{.Protocol}}</td>
        <td>{{if .IsActive}}<span class="active">Active</span>{{else}}-{{end}}</td>
        <td>
          <form method="post" action="/providers/{{.ID}}/activate">
            <button type="submit">设为启用</button>
          </form>
        </td>
      </tr>
      {{end}}
    </tbody>
  </table>
</body>
</html>`
