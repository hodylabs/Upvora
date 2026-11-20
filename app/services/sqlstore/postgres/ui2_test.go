package postgres_test

import (
	"context"
	"strconv"
	"testing"
	"time"

	"github.com/getfider/fider/app/models/cmd"
	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/query"
	. "github.com/getfider/fider/app/pkg/assert"
	"github.com/getfider/fider/app/pkg/bus"
)

// insertUI2Post adds a post to the demo tenant and returns its id.
func insertUI2Post(t *testing.T, number int, title string, userID int, status string, approved, private bool, createdAt time.Time) int {
	var id int
	err := trx.Scalar(&id, `
		INSERT INTO posts (title, slug, number, description, created_at, tenant_id, user_id, status_slug, is_approved, is_private, language)
		VALUES ($1, $2, $3, '', $4, 1, $5, $6, $7, $8, 'english') RETURNING id`,
		title, "ui2-"+strconv.Itoa(number), number, createdAt, userID, status, approved, private)
	Expect(err).IsNil()
	return id
}

func insertUI2Vote(t *testing.T, postID, userID int, at time.Time) {
	_, err := trx.Execute("INSERT INTO post_votes (tenant_id, user_id, post_id, created_at) VALUES (1, $1, $2, $3)", userID, postID, at)
	Expect(err).IsNil()
}

func moveStatus(t *testing.T, postID int, prev string, at time.Time) {
	_, err := trx.Execute("UPDATE posts SET prev_status_slug = $2, status_changed_at = $3 WHERE id = $1", postID, prev, at)
	Expect(err).IsNil()
}

func insights(ctx context.Context, numbers ...int) *entity.BoardInsights {
	q := &query.GetBoardInsights{Numbers: numbers}
	Expect(bus.Dispatch(ctx, q)).IsNil()
	return q.Result
}

// A private idea of another member, a deleted idea and another member's
// unapproved idea never show up in any map, and never count as similar.
func TestBoardInsights_HiddenPostsAbsent(t *testing.T) {
	SetupDatabaseTest(t)
	defer TeardownDatabaseTest()
	old := time.Now().Add(-48 * time.Hour)
	recent := time.Now().Add(-1 * time.Hour)

	public := insertUI2Post(t, 9101, "Export invoices spreadsheet", jonSnow.ID, "open", true, false, old)
	insertUI2Post(t, 9105, "Export invoices quickly", jonSnow.ID, "open", true, false, old)
	private := insertUI2Post(t, 9102, "Export invoices spreadsheet please", sansaStark.ID, "open", true, true, old)
	deleted := insertUI2Post(t, 9103, "Export invoices spreadsheet again", jonSnow.ID, "deleted", true, false, old)
	pending := insertUI2Post(t, 9104, "Export invoices spreadsheet pending", sansaStark.ID, "open", false, false, old)

	for _, id := range []int{public, private, deleted, pending} {
		insertUI2Vote(t, id, aryaStark.ID, old)
		moveStatus(t, id, "planned", recent)
	}
	_, err := trx.Execute("INSERT INTO idea_briefs (tenant_id, post_id, content) VALUES (1, $1, $2)", private, "## Risks & open questions\n- Budget is unknown")
	Expect(err).IsNil()

	hidden := []string{"9102", "9103", "9104"}
	for _, ctx := range []context.Context{demoTenantCtx, aryaStarkCtx} {
		res := insights(ctx, 9101, 9102, 9103, 9104, 9105)
		for _, n := range hidden {
			_, inMomentum := res.Momentum[n]
			_, inMoved := res.Moved[n]
			_, inNotes := res.Notes[n]
			Expect(inMomentum || inMoved || inNotes).IsFalse()
		}
		// 9101 has one visible similar post (9105): below the 2 needed for a note.
		_, has := res.Notes["9101"]
		Expect(has).IsFalse()
	}

	// Arya sees her own vote's move on the public idea only.
	arya := insights(aryaStarkCtx, 9101, 9102, 9103, 9104)
	Expect(arya.Moved).Equals(map[string]entity.StatusMove{"9101": {From: "planned", To: "open"}})

	// Staff see the private idea (and its similar match), never the deleted one.
	staff := insights(jonSnowCtx, 9101, 9102, 9103)
	_, deletedSeen := staff.Notes["9103"]
	Expect(deletedSeen).IsFalse()
	Expect(staff.Notes["9101"]).Equals([]entity.InsightNote{{Kind: "similar", Count: 3}})
	Expect(staff.Notes["9102"]).Equals([]entity.InsightNote{{Kind: "similar", Count: 3}, {Kind: "needs_details"}})
}

func TestBoardInsights_MomentumStaffOnly(t *testing.T) {
	SetupDatabaseTest(t)
	defer TeardownDatabaseTest()
	id := insertUI2Post(t, 9201, "Momentum idea", jonSnow.ID, "open", true, false, time.Now().Add(-30*24*time.Hour))
	insertUI2Vote(t, id, aryaStark.ID, time.Now().Add(-2*24*time.Hour))
	insertUI2Vote(t, id, sansaStark.ID, time.Now().Add(-10*24*time.Hour))
	insertUI2Post(t, 9202, "Quiet idea", jonSnow.ID, "open", true, false, time.Now())

	Expect(insights(jonSnowCtx, 9201, 9202).Momentum).Equals(map[string]int{"9201": 1})
	Expect(insights(aryaStarkCtx, 9201).Momentum).Equals(map[string]int{})
	Expect(insights(demoTenantCtx, 9201).Momentum).Equals(map[string]int{})
}

func TestBoardInsights_MovedSinceVote(t *testing.T) {
	SetupDatabaseTest(t)
	defer TeardownDatabaseTest()
	id := insertUI2Post(t, 9301, "Moved idea", jonSnow.ID, "open", true, false, time.Now().Add(-24*time.Hour))
	insertUI2Vote(t, id, aryaStark.ID, time.Now().Add(-2*time.Hour))
	later := insertUI2Post(t, 9302, "Voted after the move", jonSnow.ID, "open", true, false, time.Now().Add(-24*time.Hour))
	moveStatus(t, later, "open", time.Now().Add(-3*time.Hour))
	insertUI2Vote(t, later, aryaStark.ID, time.Now().Add(-2*time.Hour))

	// The real response command records the change and the previous status.
	get := &query.GetPostByNumber{Number: 9301}
	Expect(bus.Dispatch(jonSnowCtx, get)).IsNil()
	Expect(bus.Dispatch(jonSnowCtx, &cmd.SetPostResponse{Post: get.Result, Text: "On it", StatusSlug: "planned"})).IsNil()

	Expect(insights(aryaStarkCtx, 9301, 9302).Moved).Equals(map[string]entity.StatusMove{"9301": {From: "open", To: "planned"}})
	Expect(insights(sansaStarkCtx, 9301).Moved).Equals(map[string]entity.StatusMove{})
	Expect(insights(demoTenantCtx, 9301).Moved).Equals(map[string]entity.StatusMove{})

	// Answering again without changing the status is not a move.
	var changedAt time.Time
	Expect(trx.Scalar(&changedAt, "SELECT status_changed_at FROM posts WHERE id = $1", id)).IsNil()
	get = &query.GetPostByNumber{Number: 9301}
	Expect(bus.Dispatch(jonSnowCtx, get)).IsNil()
	Expect(bus.Dispatch(jonSnowCtx, &cmd.SetPostResponse{Post: get.Result, Text: "Still on it", StatusSlug: "planned"})).IsNil()
	var prev string
	var changedAgain time.Time
	Expect(trx.Scalar(&prev, "SELECT prev_status_slug FROM posts WHERE id = $1", id)).IsNil()
	Expect(trx.Scalar(&changedAgain, "SELECT status_changed_at FROM posts WHERE id = $1", id)).IsNil()
	Expect(prev).Equals("open")
	Expect(changedAgain.Equal(changedAt)).IsTrue()
}

func TestBoardInsights_DuplicateAndNeedsDetailsStaffOnly(t *testing.T) {
	SetupDatabaseTest(t)
	defer TeardownDatabaseTest()
	insertUI2Post(t, 9401, "Dark mode dashboard", jonSnow.ID, "open", true, false, time.Now().Add(-48*time.Hour))
	newer := insertUI2Post(t, 9402, "Dark mode dashboard please", aryaStark.ID, "open", true, false, time.Now())
	insertUI2Post(t, 9403, "Dashboard widgets", jonSnow.ID, "open", true, false, time.Now().Add(-24*time.Hour))
	_, err := trx.Execute("INSERT INTO idea_briefs (tenant_id, post_id, content) VALUES (1, $1, $2)", newer, "## Problem\nToo bright?\n\n## Risks & open questions\n- Which pages need it?")
	Expect(err).IsNil()

	staff := insights(jonSnowCtx, 9401, 9402)
	Expect(staff.Notes["9402"]).Equals([]entity.InsightNote{
		{Kind: "similar", Count: 2}, {Kind: "duplicate", Of: 9401}, {Kind: "needs_details"},
	})
	// The older idea is never flagged as a duplicate of the newer one.
	Expect(staff.Notes["9401"]).Equals([]entity.InsightNote{{Kind: "similar", Count: 2}})

	member := insights(aryaStarkCtx, 9402)
	Expect(member.Notes["9402"]).Equals([]entity.InsightNote{{Kind: "similar", Count: 2}})
}

func TestRecordUserVisit_OncePerThirtyMinutes(t *testing.T) {
	SetupDatabaseTest(t)
	defer TeardownDatabaseTest()

	first := &cmd.RecordUserVisit{}
	Expect(bus.Dispatch(aryaStarkCtx, first)).IsNil()
	Expect(first.Result).IsNil()

	// Same session: nothing moves.
	again := &cmd.RecordUserVisit{}
	Expect(bus.Dispatch(aryaStarkCtx, again)).IsNil()
	Expect(again.Result).IsNil()

	// An hour later a new visit starts; the old one becomes "since".
	_, err := trx.Execute("UPDATE users SET last_visit_at = NOW() - INTERVAL '1 hour' WHERE id = $1", aryaStark.ID)
	Expect(err).IsNil()
	var lastVisit time.Time
	Expect(trx.Scalar(&lastVisit, "SELECT last_visit_at FROM users WHERE id = $1", aryaStark.ID)).IsNil()

	next := &cmd.RecordUserVisit{}
	Expect(bus.Dispatch(aryaStarkCtx, next)).IsNil()
	Expect(next.Result).IsNotNil()
	Expect(next.Result.Equal(lastVisit)).IsTrue()

	// Further requests in this visit keep the same "since".
	same := &cmd.RecordUserVisit{}
	Expect(bus.Dispatch(aryaStarkCtx, same)).IsNil()
	Expect(same.Result.Equal(lastVisit)).IsTrue()
}

func TestBriefingCounts(t *testing.T) {
	SetupDatabaseTest(t)
	defer TeardownDatabaseTest()
	since := time.Now().Add(-1 * time.Hour)
	old := time.Now().Add(-48 * time.Hour)

	insertUI2Post(t, 9501, "Brand new idea", jonSnow.ID, "open", true, false, time.Now())
	insertUI2Post(t, 9502, "Secret new idea", sansaStark.ID, "open", true, true, time.Now())
	voted := insertUI2Post(t, 9503, "Voted and moved", jonSnow.ID, "planned", true, false, old)
	insertUI2Vote(t, voted, aryaStark.ID, old)
	moveStatus(t, voted, "open", time.Now())
	other := insertUI2Post(t, 9504, "Moved without my vote", jonSnow.ID, "started", true, false, old)
	moveStatus(t, other, "planned", time.Now())
	gone := insertUI2Post(t, 9505, "Deleted lately", jonSnow.ID, "deleted", true, false, time.Now())
	moveStatus(t, gone, "open", time.Now())
	insertUI2Post(t, 9506, "Calendar sync for teams", jonSnow.ID, "open", true, false, old)
	insertUI2Post(t, 9507, "Calendar sync for teams please", aryaStark.ID, "open", true, false, old.Add(time.Hour))

	member := &query.GetBriefingCounts{Since: since}
	Expect(bus.Dispatch(aryaStarkCtx, member)).IsNil()
	Expect(*member.Result).Equals(entity.BriefingCounts{NewIdeas: 1, StatusMoves: 2, VotedMoved: 1, Duplicates: 0})

	staff := &query.GetBriefingCounts{Since: since}
	Expect(bus.Dispatch(jonSnowCtx, staff)).IsNil()
	Expect(*staff.Result).Equals(entity.BriefingCounts{NewIdeas: 2, StatusMoves: 2, VotedMoved: 0, Duplicates: 1})
}

// Staff get the latest voters' faces; visitors get none.
func TestBoardInsights_Voters(t *testing.T) {
	SetupDatabaseTest(t)
	defer TeardownDatabaseTest()

	post := &cmd.AddNewPost{Title: "Voters face test idea", Description: ""}
	Expect(bus.Dispatch(aryaStarkCtx, post)).IsNil()
	Expect(bus.Dispatch(aryaStarkCtx, &cmd.AddVote{Post: post.Result, User: aryaStark})).IsNil()
	Expect(bus.Dispatch(jonSnowCtx, &cmd.AddVote{Post: post.Result, User: jonSnow})).IsNil()

	key := strconv.Itoa(post.Result.Number)
	staff := &query.GetBoardInsights{Numbers: []int{post.Result.Number}}
	Expect(bus.Dispatch(jonSnowCtx, staff)).IsNil()
	Expect(len(staff.Result.Voters[key])).Equals(2)
	Expect(staff.Result.Voters[key][0].Name).Equals("Jon Snow")

	visitor := &query.GetBoardInsights{Numbers: []int{post.Result.Number}}
	Expect(bus.Dispatch(demoTenantCtx, visitor)).IsNil()
	Expect(len(visitor.Result.Voters)).Equals(0)
}
