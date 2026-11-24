const test = require("node:test");
const assert = require("node:assert/strict");

const authorizeRole = require("../middleware/authorizeRole");

const response = () => ({
  statusCode: null,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

test("authorizes a permitted role", () => {
  let nextCalled = false;
  authorizeRole("admin")({ user: { role: "admin" } }, response(), () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
});

test("rejects an unauthenticated request", () => {
  const res = response();
  authorizeRole("admin")({}, res, () => {});
  assert.equal(res.statusCode, 401);
});

test("rejects a role without permission", () => {
  const res = response();
  authorizeRole("admin")({ user: { role: "buyer" } }, res, () => {});
  assert.equal(res.statusCode, 403);
});
