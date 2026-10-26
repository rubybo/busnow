import assert from "node:assert/strict";
import test from "node:test";
import { isPushEndpoint } from "./push-endpoint.ts";

test("push endpoint accepts the browser services and rejects anything else", () => {
  assert.equal(isPushEndpoint("https://fcm.googleapis.com/fcm/send/abc"), true);
  assert.equal(isPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc"), true);
  assert.equal(isPushEndpoint("https://web.push.apple.com/QQ"), true);
  assert.equal(isPushEndpoint("https://wns2.example.notify.windows.com/w/?token=abc"), true);
  assert.equal(isPushEndpoint("http://fcm.googleapis.com/fcm/send/abc"), false);
  assert.equal(isPushEndpoint("https://user:pass@fcm.googleapis.com/fcm/send/abc"), false);
  assert.equal(isPushEndpoint("https://127.0.0.1/latest/meta-data"), false);
  assert.equal(isPushEndpoint("https://fcm.googleapis.com:444/fcm/send/abc"), false);
  assert.equal(isPushEndpoint("https://fcm.googleapis.com.evil.com/fcm/send/abc"), false);
  assert.equal(isPushEndpoint("https://notify.windows.com/w/"), false);
});
