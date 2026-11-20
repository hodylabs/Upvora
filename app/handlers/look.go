package handlers

import (
	"github.com/getfider/fider/app/actions"
	"github.com/getfider/fider/app/models/cmd"
	"github.com/getfider/fider/app/pkg/bus"
	"github.com/getfider/fider/app/pkg/web"
)

// UpdateTenantUI sets which look (classic or the new UI) the site serves.
func UpdateTenantUI() web.HandlerFunc {
	return func(c *web.Context) error {
		action := new(actions.UpdateTenantUI)
		if result := c.BindTo(action); !result.Ok {
			return c.HandleValidation(result)
		}
		if err := bus.Dispatch(c, &cmd.SetTenantUI{UI: action.UI}); err != nil {
			return c.Failure(err)
		}
		return c.Ok(web.Map{"ui": action.UI})
	}
}
