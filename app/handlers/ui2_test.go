package handlers_test

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/getfider/fider/app/handlers"
	"github.com/getfider/fider/app/models/cmd"
	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/query"
	. "github.com/getfider/fider/app/pkg/assert"
	"github.com/getfider/fider/app/pkg/bus"
	"github.com/getfider/fider/app/pkg/mock"
)

const insightsURL = "http://demo.test.fider.io/_api/ui2/board-insights?numbers="

func TestBoardInsights_RejectsNonIntegers(t *testing.T) {
	RegisterT(t)
	called := false
	bus.AddHandler(func(ctx context.Context, q *query.GetBoardInsights) error { called = true; return nil })

	code, _ := mock.NewServer().OnTenant(mock.DemoTenant).WithURL(insightsURL + "12,abc").Execute(handlers.BoardInsights())
	Expect(code).Equals(http.StatusBadRequest)
	Expect(called).IsFalse()
}

func TestBoardInsights_DedupesAndCaps(t *testing.T) {
	RegisterT(t)
	var got []int
	bus.AddHandler(func(ctx context.Context, q *query.GetBoardInsights) error {
		got = q.Numbers
		q.Result = &entity.BoardInsights{
			Momentum: map[string]int{},
			Moved:    map[string]entity.StatusMove{},
			Notes:    map[string][]entity.InsightNote{"3": {{Kind: "similar", Count: 2}}},
		}
		return nil
	})

	items := []string{"3", "3", " 7"}
	for i := 100; i < 160; i++ {
		items = append(items, fmt.Sprint(i))
	}
	code, res := mock.NewServer().OnTenant(mock.DemoTenant).WithURL(insightsURL + strings.Join(items, ",")).ExecuteAsJSON(handlers.BoardInsights())
	Expect(code).Equals(http.StatusOK)
	Expect(len(got)).Equals(50)
	Expect(got[0]).Equals(3)
	Expect(got[1]).Equals(7)
	Expect(res.Contains("momentum")).IsTrue()
	Expect(res.Contains("moved")).IsTrue()
	Expect(res.String("notes.3[0].kind")).Equals("similar")
}

func TestBoardInsights_EmptyList(t *testing.T) {
	RegisterT(t)
	var got []int
	bus.AddHandler(func(ctx context.Context, q *query.GetBoardInsights) error {
		got = q.Numbers
		q.Result = &entity.BoardInsights{Momentum: map[string]int{}, Moved: map[string]entity.StatusMove{}, Notes: map[string][]entity.InsightNote{}}
		return nil
	})
	code, _ := mock.NewServer().OnTenant(mock.DemoTenant).WithURL(insightsURL).Execute(handlers.BoardInsights())
	Expect(code).Equals(http.StatusOK)
	Expect(len(got)).Equals(0)
}

func TestBriefing_RequiresSignIn(t *testing.T) {
	RegisterT(t)
	code, _ := mock.NewServer().OnTenant(mock.DemoTenant).Execute(handlers.Briefing())
	Expect(code).Equals(http.StatusUnauthorized)
}

func TestBriefing_FirstVisitUses24Hours(t *testing.T) {
	RegisterT(t)
	var since time.Time
	bus.AddHandler(func(ctx context.Context, c *cmd.RecordUserVisit) error { c.Result = nil; return nil })
	bus.AddHandler(func(ctx context.Context, q *query.GetBriefingCounts) error {
		since = q.Since
		q.Result = &entity.BriefingCounts{NewIdeas: 4, StatusMoves: 2, VotedMoved: 1}
		return nil
	})

	code, res := mock.NewServer().OnTenant(mock.DemoTenant).AsUser(mock.AryaStark).ExecuteAsJSON(handlers.Briefing())
	Expect(code).Equals(http.StatusOK)
	Expect(time.Since(since) > 23*time.Hour && time.Since(since) < 25*time.Hour).IsTrue()
	Expect(res.String("since")).Equals(since.UTC().Format(time.RFC3339))
	Expect(string(res.Raw("firstVisit"))).Equals("true")
	Expect(res.Int32("newIdeas")).Equals(4)
	Expect(res.Int32("statusMoves")).Equals(2)
	Expect(res.Int32("votedMoved")).Equals(1)
	Expect(res.Int32("duplicates")).Equals(0)
}

func TestBriefing_SinceLastVisit(t *testing.T) {
	RegisterT(t)
	prev := time.Date(2026, 11, 19, 8, 30, 0, 0, time.UTC)
	var since time.Time
	bus.AddHandler(func(ctx context.Context, c *cmd.RecordUserVisit) error { c.Result = &prev; return nil })
	bus.AddHandler(func(ctx context.Context, q *query.GetBriefingCounts) error {
		since = q.Since
		q.Result = &entity.BriefingCounts{}
		return nil
	})

	code, res := mock.NewServer().OnTenant(mock.DemoTenant).AsUser(mock.JonSnow).ExecuteAsJSON(handlers.Briefing())
	Expect(code).Equals(http.StatusOK)
	Expect(since.Equal(prev)).IsTrue()
	Expect(res.String("since")).Equals("2026-11-19T08:30:00Z")
	Expect(string(res.Raw("firstVisit"))).Equals("false")
}
