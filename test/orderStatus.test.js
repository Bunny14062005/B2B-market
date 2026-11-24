const test = require("node:test");
const assert = require("node:assert/strict");

const { canTransitionOrder } = require("../utils/orderStatus");

test("only forward fulfilment status transitions are permitted", () => {
  assert.equal(canTransitionOrder("Pending", "Shipped"), true);
  assert.equal(canTransitionOrder("Shipped", "Delivered"), true);
  assert.equal(canTransitionOrder("Pending", "Delivered"), false);
  assert.equal(canTransitionOrder("Delivered", "Shipped"), false);
  assert.equal(canTransitionOrder("Cancelled", "Pending"), false);
});
