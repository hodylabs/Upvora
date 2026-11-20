package cmd

import "time"

// RecordUserVisit starts a new visit for the current user when the last one
// is older than 30 minutes. Result is the start of the visit before the
// current one (nil when there is none).
type RecordUserVisit struct {
	Result *time.Time
}
