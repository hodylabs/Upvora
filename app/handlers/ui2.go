package handlers

import (
	"strconv"
	"strings"
	"time"

	"github.com/getfider/fider/app/models/cmd"
	"github.com/getfider/fider/app/models/query"
	"github.com/getfider/fider/app/pkg/bus"
	"github.com/getfider/fider/app/pkg/web"
)

// maxInsightNumbers caps how many posts one board-insights call covers.
const maxInsightNumbers = 50

// parseInsightNumbers reads "412,398,..." into unique post numbers, keeping
// the first maxInsightNumbers. ok is false when any item is not an integer.
func parseInsightNumbers(raw string) (numbers []int, ok bool) {
	numbers = []int{}
	if strings.TrimSpace(raw) == "" {
		return numbers, true
	}
	seen := map[int]bool{}
	for _, item := range strings.Split(raw, ",") {
		n, err := strconv.Atoi(strings.TrimSpace(item))
		if err != nil {
			return nil, false
		}
		if !seen[n] && len(numbers) < maxInsightNumbers {
			seen[n] = true
			numbers = append(numbers, n)
		}
	}
	return numbers, true
}

// BoardInsights returns the new UI's per-row data (momentum, moved since you
// voted, Vora notes) for the posts the viewer can see. What each viewer gets
// is decided in the query by their role.
func BoardInsights() web.HandlerFunc {
	return func(c *web.Context) error {
		numbers, ok := parseInsightNumbers(c.QueryParam("numbers"))
		if !ok {
			return c.BadRequest(web.Map{"numbers": "Use a comma-separated list of post numbers."})
		}
		q := &query.GetBoardInsights{Numbers: numbers}
		if err := bus.Dispatch(c, q); err != nil {
			return c.Failure(err)
		}
		return c.Ok(q.Result)
	}
}

// Briefing returns the new UI's "since your last visit" counts and records
// the visit (once per 30 minutes).
func Briefing() web.HandlerFunc {
	return func(c *web.Context) error {
		if !c.IsAuthenticated() {
			return c.Unauthorized()
		}
		visit := &cmd.RecordUserVisit{}
		if err := bus.Dispatch(c, visit); err != nil {
			return c.Failure(err)
		}
		since, firstVisit := time.Now().Add(-24*time.Hour), true
		if visit.Result != nil {
			since, firstVisit = *visit.Result, false
		}
		counts := &query.GetBriefingCounts{Since: since}
		if err := bus.Dispatch(c, counts); err != nil {
			return c.Failure(err)
		}
		return c.Ok(web.Map{
			"since":       since.UTC().Format(time.RFC3339),
			"firstVisit":  firstVisit,
			"newIdeas":    counts.Result.NewIdeas,
			"statusMoves": counts.Result.StatusMoves,
			"votedMoved":  counts.Result.VotedMoved,
			"duplicates":  counts.Result.Duplicates,
		})
	}
}
