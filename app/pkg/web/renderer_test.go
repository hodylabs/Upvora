package web_test

import (
	"bytes"
	"context"
	"net/http"
	"os"
	"strings"
	"testing"

	"github.com/getfider/fider/app"
	"github.com/getfider/fider/app/models/dto"
	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/enum"

	"github.com/getfider/fider/app/models/query"
	. "github.com/getfider/fider/app/pkg/assert"
	"github.com/getfider/fider/app/pkg/bus"
	"github.com/getfider/fider/app/pkg/env"
	"github.com/getfider/fider/app/pkg/markdown"
	"github.com/getfider/fider/app/pkg/web"
)

func compareRendererResponse(buf *bytes.Buffer, fileName string, ctx *web.Context) {
	// os.WriteFile(env.Path(fileName), []byte(strings.ReplaceAll(buf.String(), ctx.ContextID(), "CONTEXT_ID")), 0744)
	bytes, err := os.ReadFile(env.Path(fileName))
	Expect(err).IsNil()
	Expect(strings.ReplaceAll(buf.String(), ctx.ContextID(), "CONTEXT_ID")).Equals(string(bytes))
}

func TestRenderer_Basic(t *testing.T) {
	RegisterT(t)

	bus.AddHandler(func(ctx context.Context, q *query.ListActiveOAuthProviders) error {
		return nil
	})

	buf := new(bytes.Buffer)
	ctx := newGetContext("https://demo.test.fider.io:3000/", nil)
	renderer := web.NewRenderer()
	renderer.Render(buf, http.StatusOK, web.Props{}, ctx)
	compareRendererResponse(buf, "/app/pkg/web/testdata/basic.html", ctx)
}

func TestRenderer_WithChunkPreload(t *testing.T) {
	RegisterT(t)

	bus.AddHandler(func(ctx context.Context, q *query.ListActiveOAuthProviders) error {
		return nil
	})

	buf := new(bytes.Buffer)
	ctx := newGetContext("https://demo.test.fider.io:3000/", nil)
	renderer := web.NewRenderer()
	renderer.Render(buf, http.StatusOK, web.Props{Page: "Test.page"}, ctx)
	compareRendererResponse(buf, "/app/pkg/web/testdata/chunk.html", ctx)
}

func TestRenderer_Tenant(t *testing.T) {
	RegisterT(t)

	bus.AddHandler(func(ctx context.Context, q *query.ListActiveOAuthProviders) error {
		return nil
	})

	buf := new(bytes.Buffer)
	ctx := newGetContext("https://demo.test.fider.io:3000/", nil)
	ctx.SetTenant(&entity.Tenant{Name: "Game of Thrones"})
	renderer := web.NewRenderer()
	renderer.Render(buf, http.StatusOK, web.Props{}, ctx)
	compareRendererResponse(buf, "/app/pkg/web/testdata/tenant.html", ctx)
}

func TestRenderer_WithCanonicalURL(t *testing.T) {
	RegisterT(t)

	bus.AddHandler(func(ctx context.Context, q *query.ListActiveOAuthProviders) error {
		return nil
	})

	buf := new(bytes.Buffer)
	ctx := newGetContext("https://demo.test.fider.io:3000/", nil)
	ctx.SetCanonicalURL("http://feedback.demo.org")
	renderer := web.NewRenderer()
	renderer.Render(buf, http.StatusOK, web.Props{}, ctx)
	compareRendererResponse(buf, "/app/pkg/web/testdata/canonical.html", ctx)
}

func TestRenderer_Home(t *testing.T) {
	RegisterT(t)

	bus.AddHandler(func(ctx context.Context, q *query.ListActiveOAuthProviders) error {
		return nil
	})

	buf := new(bytes.Buffer)
	ctx := newGetContext("https://demo.test.fider.io:3000/", nil)
	renderer := web.NewRenderer()
	renderer.Render(buf, http.StatusOK, web.Props{
		Title:       "My Page Title",
		Description: "My Page Description",
		Data: web.Map{
			"posts":          make([]web.Map, 0),
			"tags":           make([]web.Map, 0),
			"countPerStatus": web.Map{},
		},
	}, ctx)

	compareRendererResponse(buf, "/app/pkg/web/testdata/home.html", ctx)
}

func TestRenderer_DescriptionIsEscapedOnce(t *testing.T) {
	RegisterT(t)

	bus.AddHandler(func(ctx context.Context, q *query.ListActiveOAuthProviders) error {
		return nil
	})

	buf := new(bytes.Buffer)
	ctx := newGetContext("https://demo.test.fider.io:3000/", nil)
	renderer := web.NewRenderer()
	renderer.Render(buf, http.StatusOK, web.Props{
		Title:       "My Page Title",
		Description: markdown.PlainText("**Tom & Jerry** `<details>`") + ` "><script>alert(1)</script>`,
	}, ctx)

	expected := `content="Tom &amp; Jerry &lt;details&gt; &#34;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"`
	Expect(buf.String()).ContainsSubstring(`<meta name="description" ` + expected + ` />`)
	Expect(buf.String()).ContainsSubstring(`<meta property="og:description" ` + expected + ` />`)
}

func TestRenderer_Home_SSR(t *testing.T) {
	RegisterT(t)

	bus.AddHandler(func(ctx context.Context, q *query.ListActiveOAuthProviders) error {
		return nil
	})

	buf := new(bytes.Buffer)
	ctx := newGetContext("https://demo.test.fider.io:3000/", map[string]string{
		"User-Agent": "Googlebot",
	})
	ctx.SetTenant(&entity.Tenant{
		Locale: "en",
	})
	renderer := web.NewRenderer()
	renderer.Render(buf, http.StatusOK, web.Props{
		Page:        "Test.page",
		Title:       "My Page Title",
		Description: "My Page Description",
		Data: web.Map{
			"posts":          make([]web.Map, 0),
			"tags":           make([]web.Map, 0),
			"countPerStatus": web.Map{},
		},
	}, ctx)

	compareRendererResponse(buf, "/app/pkg/web/testdata/home_ssr.html", ctx)
}

func TestRenderer_AuthenticatedUser(t *testing.T) {
	RegisterT(t)

	bus.AddHandler(func(ctx context.Context, q *query.ListActiveOAuthProviders) error {
		return nil
	})

	buf := new(bytes.Buffer)
	ctx := newGetContext("https://demo.test.fider.io:3000/", nil)
	ctx.SetUser(&entity.User{
		ID:         5,
		Name:       "Jon Snow",
		Email:      "jon.snow@got.com",
		Status:     enum.UserActive,
		Role:       enum.RoleAdministrator,
		AvatarType: enum.AvatarTypeGravatar,
		AvatarURL:  "https://demo.test.fider.io:3000/static/avatars/gravatar/5/Jon%20Snow",
	})
	renderer := web.NewRenderer()
	renderer.Render(buf, http.StatusOK, web.Props{
		Title:       "My Page Title",
		Description: "My Page Description",
	}, ctx)

	compareRendererResponse(buf, "/app/pkg/web/testdata/user.html", ctx)
}

func TestRenderer_WithOAuth(t *testing.T) {
	RegisterT(t)

	bus.AddHandler(func(ctx context.Context, q *query.ListActiveOAuthProviders) error {
		q.Result = []*dto.OAuthProviderOption{
			{
				Provider:         app.GoogleProvider,
				DisplayName:      "Google",
				ClientID:         "1234",
				URL:              "https://demo.test.fider.io:3000/oauth/google",
				CallbackURL:      "https://demo.test.fider.io:3000/oauth/google/callback",
				LogoBlobKey:      "google.png",
				IsCustomProvider: false,
				IsEnabled:        true,
			},
		}
		return nil
	})

	buf := new(bytes.Buffer)
	ctx := newGetContext("https://demo.test.fider.io:3000/", nil)
	renderer := web.NewRenderer()
	renderer.Render(buf, http.StatusOK, web.Props{}, ctx)
	compareRendererResponse(buf, "/app/pkg/web/testdata/oauth.html", ctx)
}

// A site on the new look gets the ui2 bundle and never the classic custom CSS;
// crawlers on that site still get classic (and its server-rendered HTML).
func TestRenderer_NewUI(t *testing.T) {
	RegisterT(t)

	bus.AddHandler(func(ctx context.Context, q *query.ListActiveOAuthProviders) error {
		return nil
	})

	render := func(ui string, headers map[string]string) string {
		buf := new(bytes.Buffer)
		ctx := newGetContext("https://demo.test.fider.io:3000/", headers)
		ctx.SetTenant(&entity.Tenant{Name: "Acme", Locale: "en", UI: ui, CustomCSS: ".x{color:red}"})
		web.NewRenderer().Render(buf, http.StatusOK, web.Props{Page: "Test.page"}, ctx)
		return buf.String()
	}

	newUI := render("new", nil)
	Expect(newUI).ContainsSubstring("/assets/ui2/js/ui2main.js")
	Expect(newUI).ContainsSubstring("/assets/ui2/css/ui2main.css")
	Expect(newUI).ContainsSubstring("/assets/ui2/js/Test.page.ui2.js")
	Expect(strings.Contains(newUI, "/assets/js/file1.js")).IsFalse()
	Expect(strings.Contains(newUI, "/static/custom/")).IsFalse()

	classic := render("classic", nil)
	Expect(classic).ContainsSubstring("/assets/js/file1.js")
	Expect(classic).ContainsSubstring("/static/custom/")
	Expect(strings.Contains(classic, "/assets/ui2/")).IsFalse()

	crawler := render("new", map[string]string{"User-Agent": "Googlebot"})
	Expect(strings.Contains(crawler, "/assets/ui2/")).IsFalse()
}
