package postgres

import "testing"

func TestBriefNeedsDetails(t *testing.T) {
	cases := map[string]bool{
		"## Risks & open questions\n- Budget is unknown":                          true,
		"## Risks & open questions\n1. Which teams need it?":                      true,
		"**Risks & open questions**\n- Owner TBD":                                 true,
		"## Risks & open questions\n- Slower page loads\n\n## How this went\nOK?": false,
		"## Problem\nWhy is it slow?\n## Risks & open questions\nNone.":           false,
		"": false,
	}
	for content, want := range cases {
		if got := briefNeedsDetails(content); got != want {
			t.Errorf("briefNeedsDetails(%q) = %v, want %v", content, got, want)
		}
	}
}

func TestTitlesNearlyEqual(t *testing.T) {
	cases := []struct {
		a, b string
		want bool
	}{
		{"Dark mode dashboard", "Dark mode dashboard please", true},
		{"Dark mode", "Dark mode!", true},
		{"Export invoices to CSV", "Export reports to PDF", false},
		{"Calendar", "Calendar", false}, // one word is too little to call it a duplicate
	}
	for _, c := range cases {
		if got := titlesNearlyEqual(c.a, c.b); got != c.want {
			t.Errorf("titlesNearlyEqual(%q, %q) = %v, want %v", c.a, c.b, got, c.want)
		}
	}
}
