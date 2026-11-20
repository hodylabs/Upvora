package postgres

import (
	"context"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/lib/pq"

	"github.com/getfider/fider/app/models/cmd"
	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/enum"
	"github.com/getfider/fider/app/models/query"
	"github.com/getfider/fider/app/pkg/dbx"
	"github.com/getfider/fider/app/pkg/errors"
)

// Status kinds a duplicate candidate must not have (same as Post.CanBeVoted).
const closedKinds = "('closed-completed', 'closed-declined', 'duplicate')"

type insightPost struct {
	ID         int       `db:"id"`
	Number     int       `db:"number"`
	Title      string    `db:"title"`
	CreatedAt  time.Time `db:"created_at"`
	StatusKind string    `db:"status_kind"`
}

func (p insightPost) isOpen() bool {
	return p.StatusKind != "closed-completed" && p.StatusKind != "closed-declined" && p.StatusKind != "duplicate"
}

const sqlInsightPosts = `
	SELECT p.id, p.number, p.title, p.created_at, COALESCE(ps.kind, '') AS status_kind
	FROM posts p
	LEFT JOIN statuses ps ON ps.tenant_id = p.tenant_id AND ps.slug = p.status_slug
	WHERE p.tenant_id = $1 AND %s %s`

func isStaff(user *entity.User) bool {
	return user != nil && user.IsCollaborator()
}

func getBoardInsights(ctx context.Context, q *query.GetBoardInsights) error {
	return using(ctx, func(trx *dbx.Trx, tenant *entity.Tenant, user *entity.User) error {
		res := &entity.BoardInsights{
			Momentum: map[string]int{},
			Moved:    map[string]entity.StatusMove{},
			Notes:    map[string][]entity.InsightNote{},
			Voters:   map[string][]entity.InsightVoter{},
		}
		q.Result = res
		if len(q.Numbers) == 0 {
			return nil
		}
		numbers := pq.Array(q.Numbers)
		vis := visiblePostsClause(user)

		if isStaff(user) {
			var rows []*struct {
				Number int `db:"number"`
				Votes  int `db:"votes"`
			}
			err := trx.Select(&rows, `
				SELECT p.number, COUNT(*) AS votes
				FROM post_votes v
				INNER JOIN posts p ON p.id = v.post_id AND p.tenant_id = v.tenant_id
				WHERE v.tenant_id = $1 AND p.number = ANY($2)
				AND v.created_at > NOW() - INTERVAL '7 days'`+vis+`
				GROUP BY p.number`, tenant.ID, numbers)
			if err != nil {
				return errors.Wrap(err, "failed to count recent votes")
			}
			for _, r := range rows {
				res.Momentum[strconv.Itoa(r.Number)] = r.Votes
			}

			// Voter faces, staff only like classic's voter list: the latest 3 per post.
			var voters []*struct {
				Number     int             `db:"number"`
				UserID     int             `db:"user_id"`
				Name       string          `db:"name"`
				AvatarType enum.AvatarType `db:"avatar_type"`
				AvatarBKey string          `db:"avatar_bkey"`
			}
			err = trx.Select(&voters, `
				SELECT number, user_id, name, avatar_type, avatar_bkey FROM (
					SELECT p.number, u.id AS user_id, u.name, u.avatar_type, u.avatar_bkey,
						ROW_NUMBER() OVER (PARTITION BY p.id ORDER BY v.created_at DESC) AS rn
					FROM post_votes v
					INNER JOIN posts p ON p.id = v.post_id AND p.tenant_id = v.tenant_id
					INNER JOIN users u ON u.id = v.user_id AND u.tenant_id = v.tenant_id
					WHERE v.tenant_id = $1 AND p.number = ANY($2)`+vis+`
				) ranked WHERE rn <= 3 ORDER BY number, rn`, tenant.ID, numbers)
			if err != nil {
				return errors.Wrap(err, "failed to get recent voters")
			}
			for _, v := range voters {
				key := strconv.Itoa(v.Number)
				res.Voters[key] = append(res.Voters[key], entity.InsightVoter{
					Name:      v.Name,
					AvatarURL: buildAvatarURL(ctx, v.AvatarType, v.UserID, v.Name, v.AvatarBKey),
				})
			}
		}

		if user != nil {
			var rows []*struct {
				Number int    `db:"number"`
				From   string `db:"prev_status"`
				To     string `db:"status_slug"`
			}
			err := trx.Select(&rows, `
				SELECT p.number, COALESCE(p.prev_status_slug, '') AS prev_status, p.status_slug
				FROM post_votes v
				INNER JOIN posts p ON p.id = v.post_id AND p.tenant_id = v.tenant_id
				WHERE v.tenant_id = $1 AND p.number = ANY($2) AND v.user_id = $3
				AND p.status_changed_at > v.created_at`+vis,
				tenant.ID, numbers, user.ID)
			if err != nil {
				return errors.Wrap(err, "failed to find posts moved since the vote")
			}
			for _, r := range rows {
				res.Moved[strconv.Itoa(r.Number)] = entity.StatusMove{From: r.From, To: r.To}
			}
		}

		var posts []*insightPost
		if err := trx.Select(&posts, fmt.Sprintf(sqlInsightPosts, "p.number = ANY($2)", vis), tenant.ID, numbers); err != nil {
			return errors.Wrap(err, "failed to get posts for insights")
		}

		needsDetails := map[int]bool{}
		if isStaff(user) && len(posts) > 0 {
			var briefs []*struct {
				Number  int    `db:"number"`
				Content string `db:"content"`
			}
			err := trx.Select(&briefs, `
				SELECT p.number, b.content
				FROM idea_briefs b
				INNER JOIN posts p ON p.id = b.post_id AND p.tenant_id = b.tenant_id
				WHERE b.tenant_id = $1 AND p.number = ANY($2)`+vis, tenant.ID, numbers)
			if err != nil {
				return errors.Wrap(err, "failed to get idea briefs for insights")
			}
			for _, b := range briefs {
				needsDetails[b.Number] = briefNeedsDetails(b.Content)
			}
		}

		for _, p := range posts {
			sim, err := similarInsightFor(trx, tenant, user, p)
			if err != nil {
				return err
			}
			var notes []entity.InsightNote
			if sim.similar >= 2 {
				notes = append(notes, entity.InsightNote{Kind: "similar", Count: sim.similar})
			}
			if sim.dupOf > 0 {
				notes = append(notes, entity.InsightNote{Kind: "duplicate", Of: sim.dupOf})
			}
			if needsDetails[p.Number] {
				notes = append(notes, entity.InsightNote{Kind: "needs_details"})
			}
			if len(notes) > 0 {
				res.Notes[strconv.Itoa(p.Number)] = notes
			}
		}
		return nil
	})
}

// similarInsight is the cached result of the similar search for one post.
type similarInsight struct {
	similar int // other visible posts found, capped at maxSimilar
	dupOf   int // staff only: number of the likely original, 0 when none
	expires time.Time
}

const (
	maxSimilar      = 9
	similarCacheTTL = 10 * time.Minute
	similarCacheMax = 5000
)

var similarCache = struct {
	sync.Mutex
	m map[string]similarInsight
}{m: map[string]similarInsight{}}

// similarInsightFor runs the similar-ideas search for p, at most once per TTL.
// Non-staff viewers all share the visitor's view (public, approved posts), so a
// member never sees counts that include ideas hidden from them; staff share
// the full view. Duplicates are only looked for in the staff view.
func similarInsightFor(trx *dbx.Trx, tenant *entity.Tenant, user *entity.User, p *insightPost) (similarInsight, error) {
	staff := isStaff(user)
	var scopeUser *entity.User
	if staff {
		scopeUser = user
	}
	key := fmt.Sprintf("%d|%d|%t|%d|%s|%s", tenant.ID, p.Number, staff, p.CreatedAt.UnixNano(), p.StatusKind, p.Title)

	now := time.Now()
	similarCache.Lock()
	cached, ok := similarCache.m[key]
	similarCache.Unlock()
	if ok && now.Before(cached.expires) {
		return cached, nil
	}

	result := similarInsight{expires: now.Add(similarCacheTTL)}
	if preprocessSearchQuery(p.Title) != "" {
		match, score := similarSearchExprs(tenant, "p", "$3")
		var found []*insightPost
		err := trx.Select(&found, fmt.Sprintf(sqlInsightPosts,
			"p.number <> $2 AND COALESCE(ps.kind, '') IN ('open', 'active', 'closed-completed', 'closed-declined') AND ("+match+")",
			visiblePostsClause(scopeUser)+" ORDER BY "+score+" DESC LIMIT "+strconv.Itoa(maxSimilar)),
			tenant.ID, p.Number, ToTSQuery(SanitizeString(p.Title)))
		if err != nil {
			return result, errors.Wrap(err, "failed to find similar posts for insights")
		}
		result.similar = len(found)
		if staff && p.isOpen() {
			// Results are best match first; the first older open one with a
			// near-identical title is the likely original.
			for _, f := range found {
				if f.isOpen() && f.CreatedAt.Before(p.CreatedAt) && titlesNearlyEqual(p.Title, f.Title) {
					result.dupOf = f.Number
					break
				}
			}
		}
	}

	similarCache.Lock()
	if len(similarCache.m) >= similarCacheMax {
		for k, v := range similarCache.m {
			if now.After(v.expires) {
				delete(similarCache.m, k)
			}
		}
		// shortcut: still full means many live entries; dropping all is simpler
		// than LRU and only costs a recompute. Upgrade if this shows in metrics.
		if len(similarCache.m) >= similarCacheMax {
			similarCache.m = map[string]similarInsight{}
		}
	}
	similarCache.m[key] = result
	similarCache.Unlock()
	return result, nil
}

func titleWords(title string) map[string]bool {
	words := map[string]bool{}
	for _, w := range strings.Fields(preprocessSearchQuery(allowedTextRunes.ReplaceAllString(title, " "))) {
		words[w] = true
	}
	return words
}

// titlesNearlyEqual is the conservative duplicate rule: the meaningful title
// words (noise words and words under 3 letters dropped) overlap by at least 2
// words and by at least 60% of all words in either title (Jaccard >= 0.6).
func titlesNearlyEqual(a, b string) bool {
	wa, wb := titleWords(a), titleWords(b)
	common := 0
	for w := range wa {
		if wb[w] {
			common++
		}
	}
	union := len(wa) + len(wb) - common
	return common >= 2 && union > 0 && float64(common)/float64(union) >= 0.6
}

var missingMarkers = []string{
	"not discussed", "not specified", "not mentioned", "not defined", "not decided",
	"to be determined", "tbd", "unknown", "unclear", "undecided", "missing",
}

func isBriefHeading(line string) bool {
	return strings.HasPrefix(line, "#") ||
		(strings.HasPrefix(line, "**") && (strings.HasSuffix(line, "**") || strings.HasSuffix(line, "**:")))
}

var listMarker = regexp.MustCompile(`^([-*+]|\d+[.)])\s*`)

// briefNeedsDetails reads the brief's "Risks & open questions" section: the
// idea needs details when a point there is a question or says something was
// not discussed, unknown, missing and the like. Risks alone do not count.
func briefNeedsDetails(content string) bool {
	inSection := false
	for _, line := range strings.Split(content, "\n") {
		t := strings.TrimSpace(line)
		if isBriefHeading(t) {
			inSection = strings.Contains(strings.ToLower(t), "open question")
			continue
		}
		t = strings.ToLower(listMarker.ReplaceAllString(t, ""))
		if !inSection || t == "" || t == "none" || t == "none." {
			continue
		}
		if strings.HasSuffix(t, "?") {
			return true
		}
		for _, m := range missingMarkers {
			if strings.Contains(t, m) {
				return true
			}
		}
	}
	return false
}

func recordUserVisit(ctx context.Context, c *cmd.RecordUserVisit) error {
	return using(ctx, func(trx *dbx.Trx, tenant *entity.Tenant, user *entity.User) error {
		// The condition lives in the UPDATE so concurrent requests start at
		// most one new visit: the second waits for the row lock, then sees the
		// fresh last_visit_at and matches nothing.
		_, err := trx.Execute(`
			UPDATE users SET prev_visit_at = last_visit_at, last_visit_at = NOW()
			WHERE id = $1 AND tenant_id = $2
			AND (last_visit_at IS NULL OR last_visit_at < NOW() - INTERVAL '30 minutes')`,
			user.ID, tenant.ID)
		if err != nil {
			return errors.Wrap(err, "failed to record user visit")
		}
		var prev dbx.NullTime
		if err := trx.Scalar(&prev, "SELECT prev_visit_at FROM users WHERE id = $1 AND tenant_id = $2", user.ID, tenant.ID); err != nil {
			return errors.Wrap(err, "failed to read previous user visit")
		}
		c.Result = nil
		if prev.Valid {
			c.Result = &prev.Time
		}
		return nil
	})
}

// briefingDuplicateWindow bounds the staff duplicate count to the most recent
// open posts, so the briefing costs at most this many (cached) searches.
const briefingDuplicateWindow = 100

func getBriefingCounts(ctx context.Context, q *query.GetBriefingCounts) error {
	return using(ctx, func(trx *dbx.Trx, tenant *entity.Tenant, user *entity.User) error {
		userID := 0
		if user != nil {
			userID = user.ID
		}
		vis := visiblePostsClause(user)
		var counts struct {
			NewIdeas    int `db:"new_ideas"`
			StatusMoves int `db:"status_moves"`
			VotedMoved  int `db:"voted_moved"`
		}
		err := trx.Get(&counts, `
			SELECT
				COUNT(*) FILTER (WHERE p.created_at > $2) AS new_ideas,
				COUNT(*) FILTER (WHERE p.status_changed_at > $2) AS status_moves,
				COUNT(*) FILTER (WHERE p.status_changed_at > $2 AND EXISTS (
					SELECT 1 FROM post_votes v
					WHERE v.post_id = p.id AND v.tenant_id = p.tenant_id
					AND v.user_id = $3 AND v.created_at < p.status_changed_at
				)) AS voted_moved
			FROM posts p
			WHERE p.tenant_id = $1 AND (p.created_at > $2 OR p.status_changed_at > $2)`+vis,
			tenant.ID, q.Since, userID)
		if err != nil {
			return errors.Wrap(err, "failed to count briefing")
		}
		q.Result = &entity.BriefingCounts{
			NewIdeas:    counts.NewIdeas,
			StatusMoves: counts.StatusMoves,
			VotedMoved:  counts.VotedMoved,
		}

		if isStaff(user) {
			var posts []*insightPost
			err := trx.Select(&posts, fmt.Sprintf(sqlInsightPosts,
				"COALESCE(ps.kind, '') NOT IN "+closedKinds,
				vis+" ORDER BY p.created_at DESC LIMIT "+strconv.Itoa(briefingDuplicateWindow)),
				tenant.ID)
			if err != nil {
				return errors.Wrap(err, "failed to get open posts for briefing")
			}
			for _, p := range posts {
				sim, err := similarInsightFor(trx, tenant, user, p)
				if err != nil {
					return err
				}
				if sim.dupOf > 0 {
					q.Result.Duplicates++
				}
			}
		}
		return nil
	})
}
