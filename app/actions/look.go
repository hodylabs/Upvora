package actions

import (
	"context"

	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/pkg/validate"
)

// UpdateTenantUI switches the whole site between the classic look and the new UI.
// Administrators only; it changes nothing else (no data, URLs or sign-ins).
type UpdateTenantUI struct {
	UI string `json:"ui"` // classic | new
}

func (a *UpdateTenantUI) IsAuthorized(ctx context.Context, user *entity.User) bool {
	return user != nil && user.IsAdministrator()
}

func (a *UpdateTenantUI) Validate(ctx context.Context, user *entity.User) *validate.Result {
	result := validate.Success()
	if a.UI != "classic" && a.UI != "new" {
		result.AddFieldFailure("ui", "Look must be classic or new.")
	}
	return result
}
