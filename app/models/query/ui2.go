package query

import (
	"time"

	"github.com/getfider/fider/app/models/entity"
)

// GetBoardInsights returns momentum, "moved since you voted" and Vora notes
// for the given post numbers, limited to posts the viewer can see.
type GetBoardInsights struct {
	Numbers []int

	Result *entity.BoardInsights
}

// GetBriefingCounts counts what happened since a time, as the viewer sees it.
type GetBriefingCounts struct {
	Since time.Time

	Result *entity.BriefingCounts
}
