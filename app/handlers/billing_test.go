package handlers_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/getfider/fider/app/handlers"
	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/query"
	. "github.com/getfider/fider/app/pkg/assert"
	"github.com/getfider/fider/app/pkg/bus"
	"github.com/getfider/fider/app/pkg/mock"
	"github.com/getfider/fider/app/pkg/web"
)

func TestCheckout_RefusedWithAnExistingStripeSubscription(t *testing.T) {
	RegisterT(t)

	bus.AddHandler(func(ctx context.Context, q *query.GetStripeBillingState) error {
		q.Result = &entity.StripeBillingState{CustomerID: "cus_1", SubscriptionID: "sub_1"}
		return nil
	})

	server := mock.NewServer()
	for _, h := range []func() web.HandlerFunc{handlers.CreateStripeCheckoutSession, handlers.CreateStripeAnnualCheckoutSession} {
		code, _ := server.OnTenant(mock.DemoTenant).AsUser(mock.JonSnow).ExecutePost(h(), `{}`)
		Expect(code).Equals(http.StatusBadRequest)
	}
}
