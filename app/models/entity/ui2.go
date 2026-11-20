package entity

// StatusMove is a post's status before and after its latest change.
// From is "" when the previous status is unknown (changes made before
// status history was recorded).
type StatusMove struct {
	From string `json:"from"`
	To   string `json:"to"`
}

// InsightNote is one Vora row note on the new UI board. Kind is "similar"
// (Count set), "duplicate" (Of set) or "needs_details".
type InsightNote struct {
	Kind  string `json:"kind"`
	Count int    `json:"count,omitempty"`
	Of    int    `json:"of,omitempty"`
}

// InsightVoter is one face in a staff row's voter stack.
type InsightVoter struct {
	Name      string `json:"name"`
	AvatarURL string `json:"avatarURL"`
}

// BoardInsights is the per-row data for the new UI board, keyed by post
// number as a string. Posts with nothing to show have no entry.
type BoardInsights struct {
	Momentum map[string]int            `json:"momentum"`
	Moved    map[string]StatusMove     `json:"moved"`
	Notes    map[string][]InsightNote  `json:"notes"`
	Voters   map[string][]InsightVoter `json:"voters"` // staff only: the latest 3 voters per post
}

// BriefingCounts are the "since your last visit" numbers of the new UI.
type BriefingCounts struct {
	NewIdeas    int
	StatusMoves int
	VotedMoved  int
	Duplicates  int
}
