/* global wx:readonly, App:readonly */
// Self-authored teaching fixture. Do not upload or submit for WeChat review.
// This unreachable branch is a static scan signal; it never requests location.
// eslint-disable-next-line no-constant-condition -- Keep the teaching API signal unreachable at runtime.
if (false) {
  wx.getLocation({ type: 'wgs84' });
}

App({});
